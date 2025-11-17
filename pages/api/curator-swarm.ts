// This is a server-side file.
import { GoogleGenAI, Chat, FunctionDeclarationsTool, Type } from "@google/genai";
import { specialistCuratorPrompt } from '../../utils/prompts';
import { v4 as uuidv4 } from 'uuid';
import { DatasetState, FeedbackLogEntry, SwarmJobStatus, SwarmJobResult, SpecialistAgentResult } from '../../types';
import { CLEAVAGE_IDS, TACTIC_IDS } from '../../utils/constants';

// In-memory store for jobs. In a real application, use Redis, Firestore, etc.
const jobStore = new Map<string, SwarmJobStatus>();

const GOOGLE_SEARCH_TOOL: FunctionDeclarationsTool = {
  functionDeclarations: [{
    name: 'GoogleSearch',
    description: "Search Google for a list of queries. Use advanced operators like 'site:x.com' to find authentic comments, not news articles.",
    parameters: { type: Type.OBJECT, properties: { queries: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ['queries'] }
  }]
};

const logToJob = (jobId: string, message: string) => {
  const job = jobStore.get(jobId);
  if (job) {
    if (!job.log) job.log = [];
    const timestamp = new Date().toLocaleTimeString();
    job.log.push(`[${timestamp}] ${message}`);
    jobStore.set(jobId, job);
  }
};

// FIX: Add an explicit type for the discriminated union to help TypeScript's type narrowing.
type ApoAnalysisResult = {
    hasInsights: true;
    mostProblematicCleavage: string | undefined;
    mostMissedTactic: string | undefined;
    summary: string;
} | {
    hasInsights: false;
    summary: string;
};

// --- APO Analysis Logic ---
// FIX: Add the explicit return type to the function signature.
const analyzeApoFeedback = (feedback: FeedbackLogEntry[]): ApoAnalysisResult => {
    if (!feedback || feedback.length === 0) {
        return { hasInsights: false, summary: "No recent feedback to analyze." };
    }

    const cleavageCorrections: { [key: string]: number } = {};
    const tacticCorrections: { [key: string]: number } = {};

    for (const entry of feedback) {
        // Analyze cleavage changes
        entry.originalAnnotation.cleavages.forEach((originalScore, i) => {
            const finalScore = entry.correctedAnnotation.cleavages[i];
            if (Math.abs(originalScore - finalScore) > 0.2) { // Significant change
                const cleavageId = CLEAVAGE_IDS[i];
                cleavageCorrections[cleavageId] = (cleavageCorrections[cleavageId] || 0) + 1;
            }
        });

        // Analyze tactic changes
        const originalTactics = new Set(entry.originalAnnotation.tactics);
        const finalTactics = new Set(entry.correctedAnnotation.tactics);
        TACTIC_IDS.forEach(tactic => {
            if (!originalTactics.has(tactic) && finalTactics.has(tactic)) {
                tacticCorrections[tactic] = (tacticCorrections[tactic] || 0) + 1; // Tactic was missed
            }
        });
    }

    const getTopProblem = (corrections: { [key: string]: number }) => {
        return Object.entries(corrections).sort(([, a], [, b]) => b - a)[0]?.[0];
    };

    const mostProblematicCleavage = getTopProblem(cleavageCorrections);
    const mostMissedTactic = getTopProblem(tacticCorrections);

    if (!mostProblematicCleavage && !mostMissedTactic) {
        return { hasInsights: false, summary: "Analyzed feedback, no significant correction patterns found." };
    }
    
    const insights: ApoAnalysisResult = {
        hasInsights: true,
        mostProblematicCleavage,
        mostMissedTactic,
        summary: `Found patterns: Agents struggle with scoring '${mostProblematicCleavage}' and tend to miss identifying '${mostMissedTactic}'.`
    };

    return insights;
};


// --- Orchestrator Logic ---
async function runSwarmJob(jobId: string, datasetState: DatasetState, apoFeedback: FeedbackLogEntry[], manualQueries?: string, ragContext?: string) {
  const job = jobStore.get(jobId);
  if (!job) return;

  try {
    // === STAGE 1: PLANNING ===
    job.stage = 'PLANNING';
    job.message = 'Analyzing dataset and feedback...';
    logToJob(jobId, '[Orchestrator] Analyzing dataset for gaps and APO feedback...');
    jobStore.set(jobId, job);
    
    const apoInsights = analyzeApoFeedback(apoFeedback);
    logToJob(jobId, `[Orchestrator] APO Analysis: ${apoInsights.summary}`);

    const getTopGaps = (data: { [key: string]: number }, count: number) => {
      return Object.entries(data)
        .sort(([, a], [, b]) => a - b)
        .slice(0, count)
        .map(([key]) => key);
    };

    const [leastRepresentedCleavage, secondLeastCleavage] = getTopGaps(datasetState.cleavages, 2);
    const [leastRepresentedTactic, secondLeastTactic] = getTopGaps(datasetState.tactics, 2);

    // Nuanced Task Decomposition based on deeper analysis
    let balancerTask = `Your primary goal is to address the most significant gap in our dataset. The least-represented cleavage is '${leastRepresentedCleavage}'. Formulate high-precision queries to find clear examples of this cleavage in action.`;
    if (apoInsights.hasInsights && apoInsights.mostProblematicCleavage === leastRepresentedCleavage) {
        balancerTask += `\n**CRITICAL APO INSIGHT:** Human reviewers have recently corrected many annotations for '${leastRepresentedCleavage}', often because the agent's score was too high or misapplied. Therefore, you MUST prioritize finding **unambiguous, textbook examples**. Avoid subtle or borderline cases.`;
    }

    let explorerTask = `Your task is to find novel intersections. We need examples that combine the second-least represented cleavage, '${secondLeastCleavage}', with the least represented tactic, '${leastRepresentedTactic}'. Formulate queries using AND-style logic to discover posts where both are present.`;
    if (apoInsights.hasInsights && apoInsights.mostMissedTactic === leastRepresentedTactic) {
        explorerTask += `\n**CRITICAL APO INSIGHT:** Human reviewers have noted that agents frequently miss the '${leastRepresentedTactic}' tactic. Be extra vigilant for its presence, even if it's subtle. Your success depends on correctly identifying this specific tactic in combination with the cleavage.`;
    }

    let wildcardTask = `Your task is to act as an OSINT expert. Use your own reasoning and heuristic triggers to find posts related to new, emerging, or surprising narratives in Polish politics that might not be captured by gap-filling alone. Ensure the posts are high-quality and relevant.`;
    if (apoInsights.hasInsights) {
        wildcardTask += `\n**APO GUIDANCE:** Be cautious with topics that have previously led to ambiguous results requiring heavy correction. APO analysis indicates past struggles with accurately scoring '${apoInsights.mostProblematicCleavage}'. Prioritize clarity and avoid posts that are likely to be ambiguous.`;
    }

    let tasks = [
        { name: 'Balancer', persona: 'Data-Gap Analyst', task: balancerTask },
        { name: 'Explorer', persona: 'Creative Strategist', task: explorerTask },
        { name: 'Wildcard', persona: 'OSINT Expert', task: wildcardTask }
    ];

    if (manualQueries) {
      tasks = [{ name: 'Manual', persona: 'User Proxy', task: `Fulfill this high-priority manual query. Use RAG context if provided. Query: "${manualQueries}"`}, ...tasks.slice(0, 2)]
    }
    
    logToJob(jobId, `[Orchestrator] Decomposing nuanced tasks for ${tasks.length} agents...`);

    // === STAGE 2: EXECUTING SWARM ===
    job.stage = 'EXECUTING_SWARM';
    job.message = `Executing Swarm: 0/${tasks.length} agents complete...`;
    job.progress = 0;
    job.total = tasks.length;
    logToJob(jobId, `[Orchestrator] Dispatching swarm of ${tasks.length} agents.`);
    jobStore.set(jobId, job);
    
    const sharedScratchpad = new Set<string>();
    
    const agentPromises = tasks.map(agentTask => 
      runSpecialistAgent(agentTask.name as any, agentTask.persona, agentTask.task, sharedScratchpad, ragContext)
        .then(result => {
          job.progress = (job.progress || 0) + 1;
          job.message = `Executing Swarm: ${job.progress}/${job.total} agents complete...`;
          logToJob(jobId, `[${result.agentName}] ${result.log}`);
          jobStore.set(jobId, job);
          return result;
        })
    );

    const agentResults = await Promise.allSettled(agentPromises);

    // === STAGE 3: SYNTHESIZING ===
    job.stage = 'SYNTHESIZING';
    job.message = 'Synthesizing results...';
    job.progress = undefined;
    job.total = undefined;
    logToJob(jobId, '[Orchestrator] All agents complete. Synthesizing results...');
    jobStore.set(jobId, job);
    
    const successfulResults: SpecialistAgentResult[] = [];
    agentResults.forEach(res => {
      if (res.status === 'fulfilled') {
        successfulResults.push(res.value);
      } else {
        console.error('An agent failed:', res.reason);
        logToJob(jobId, `[Orchestrator] An agent failed: ${res.reason}`);
      }
    });

    // Deduplicate and select final batch
    const allPosts = new Map<string, string>();
    successfulResults.forEach(res => {
      res.contributedPosts.forEach(post => {
        const postHash = post.slice(0, 100); // Simple hash for dedupe
        if (!allPosts.has(postHash)) {
          allPosts.set(postHash, post);
        }
      });
    });

    const finalPosts = Array.from(allPosts.values()).slice(0, 10); // Limit to 10
    logToJob(jobId, `[Orchestrator] Synthesized ${finalPosts.length} unique posts from a pool of ${allPosts.size}.`);

    // Global Reflection for trigger suggestions
    const triggerSuggestions = successfulResults
      .filter(r => r.contributedPosts.length > 0)
      .map(r => `The ${r.agentName} agent had success with queries like: ${r.executedQueries}`);
    
    if (triggerSuggestions.length > 0) {
      logToJob(jobId, `[Orchestrator] Generated ${triggerSuggestions.length} new trigger suggestions.`);
    }

    const finalResult: SwarmJobResult = {
      finalPosts,
      triggerSuggestions,
      agentReports: successfulResults,
    };
    
    job.stage = 'COMPLETE';
    job.message = 'Job complete.';
    job.result = finalResult;
    logToJob(jobId, `[Orchestrator] Job complete. Returning batch of ${finalPosts.length} posts.`);
    jobStore.set(jobId, job);

  } catch (error: any) {
    job.stage = 'FAILED';
    job.message = error.message;
    logToJob(jobId, `[Orchestrator] CRITICAL ERROR: ${error.message}`);
    jobStore.set(jobId, job);
    console.error(`Job ${jobId} failed:`, error);
  }
}

// --- Specialist Agent Logic ---
async function runSpecialistAgent(
  agentName: 'Balancer' | 'Explorer' | 'Wildcard' | 'Manual', 
  persona: string, 
  task: string, 
  scratchpad: Set<string>, 
  ragContext?: string
): Promise<SpecialistAgentResult> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const chat: Chat = ai.chats.create({ model: 'gemini-2.5-flash', config: { tools: [GOOGLE_SEARCH_TOOL] } });

  const taskDescription = `
    **Persona:** ${persona}
    **Task:** ${task}
    ${ragContext ? `**High-Priority RAG Context:**\n${ragContext}` : ''}
  `;
  
  const prompt = specialistCuratorPrompt
    .replace('{AGENT_TASK_DESCRIPTION}', taskDescription)
    .replace('{AGENT_PERSONA}', persona)
    .replace('{AGENT_TASK}', task)
    .replace('{SCRATCHPAD_POST_IDS}', JSON.stringify(Array.from(scratchpad)));

  let result = await chat.sendMessage({ message: prompt });
  let loopCount = 0;
  let executedQueries = "N/A";

  while (loopCount++ < 3) {
    const functionCalls = result.functionCalls;
    if (!functionCalls || functionCalls.length === 0) break;
    
    const call = functionCalls[0];
    if (call.name === 'GoogleSearch') {
      executedQueries = call.args.queries?.join(', ') || "[]";
      // Mock search results
      const snippets = Array.from({ length: 5 }, (_, i) => `Mock post from ${agentName} agent #${i}: ${task.slice(0, 50)}...`);
      result = await chat.sendMessage({ message: { functionResponses: [{id: call.id, name: call.name, response: { result: { snippets }}}] } });
    } else {
      break;
    }
  }

  const responseText = result.text.trim();
  try {
    const responseJson = JSON.parse(responseText.match(/\{.*\}/s)?.[0] || '{}');
    const posts = responseJson.retrieved_posts || [];
    
    // Add to scratchpad
    posts.forEach((p: string) => scratchpad.add(p.slice(0, 100)));

    return {
      agentName,
      contributedPosts: posts,
      executedQueries: responseJson.search_report || executedQueries,
      log: `Agent completed its task and found ${posts.length} potential posts.`
    };
  } catch (e) {
    console.error(`Agent ${agentName} failed to produce valid JSON:`, responseText);
    return {
      agentName,
      contributedPosts: [],
      executedQueries,
      log: `Agent failed to produce valid JSON output.`
    };
  }
}


// --- API Handler ---
export default async function handler(req: any, res: any) {
  if (req.method === 'POST') {
    const jobId = uuidv4();
    const { datasetState, apoFeedback, manualQueries, ragContext } = req.body;

    const initialStatus: SwarmJobStatus = {
      jobId,
      stage: 'IDLE',
      message: 'Job created.',
      result: null,
      log: [],
    };
    jobStore.set(jobId, initialStatus);

    // Start the job in the background (don't await)
    runSwarmJob(jobId, datasetState, apoFeedback, manualQueries, ragContext);
    
    res.status(202).json({ jobId });

  } else if (req.method === 'GET') {
    const { jobId } = req.query;
    if (typeof jobId !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid jobId' });
    }
    
    const job = jobStore.get(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // If job is complete, remove it from memory after a short delay
    if (job.stage === 'COMPLETE' || job.stage === 'FAILED') {
      setTimeout(() => jobStore.delete(jobId), 5000);
    }

    res.status(200).json(job);
  } else {
    res.status(405).json({ error: 'Method Not Allowed' });
  }
}
