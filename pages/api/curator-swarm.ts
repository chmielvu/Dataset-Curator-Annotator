
// This is a server-side file.
import { GoogleGenAI, Chat, FunctionDeclarationsTool, Type } from "@google/genai";
import { specialistCuratorPrompt, orchestratorPlannerPrompt, orchestratorSynthesizerPrompt } from '../../utils/prompts';
import { v4 as uuidv4 } from 'uuid';
import { DatasetState, SwarmJobStatus, SwarmJobResult, SpecialistAgentResult } from '../../types';

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

// Helper to call Gemini and handle responses
async function callGemini(
  ai: GoogleGenAI,
  prompt: string,
  model: string = "gemini-2.5-flash",
  expectJson: boolean = false
) {
  try {
    const config: any = { model, contents: prompt };
    if (expectJson) {
      config.config = { responseMimeType: "application/json" };
    }
    
    const response = await ai.models.generateContent(config);
    const text = response.text;

    if (expectJson) {
      try {
        const cleanedText = text.replace(/^```json/, '').replace(/```$/, '').trim();
        return JSON.parse(cleanedText);
      } catch (e) {
        console.error("Failed to parse JSON from model:", text);
        throw new Error(`Model returned invalid JSON after cleaning. Content: ${text}`);
      }
    }
    return text;
  } catch(e: any) {
    console.error(`Error calling Gemini model ${model}:`, e);
    throw new Error(`API call to model ${model} failed: ${e.message}`);
  }
}


// --- Program-of-Thought Swarm Logic ---
async function runSwarmJob(jobId: string, datasetState: DatasetState, apoFeedback: any[], manualQueries?: string, ragContext?: string) {
  const job = jobStore.get(jobId);
  if (!job) return;

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // === STAGE 1: PLANNING ===
    job.stage = 'PLANNING';
    job.message = 'Orchestrator is analyzing dataset and creating a search plan...';
    logToJob(jobId, '[Orchestrator] Analyzing dataset state, feedback, and manual queries to create a plan.');
    jobStore.set(jobId, job);

    const plannerPrompt = orchestratorPlannerPrompt
        .replace('{DATASET_STATE}', JSON.stringify(datasetState, null, 2))
        .replace('{APO_FEEDBACK}', JSON.stringify(apoFeedback, null, 2))
        .replace('{MANUAL_QUERIES}', manualQueries || "N/A");

    const planResult = await callGemini(ai, plannerPrompt, "gemini-2.5-pro", true);
    const agentTasks = planResult.plan;
    
    if (!agentTasks || !Array.isArray(agentTasks) || agentTasks.length !== 3) {
      throw new Error('Orchestrator Planner failed to return a valid 3-agent plan.');
    }
    logToJob(jobId, `[Orchestrator] Plan created for ${agentTasks.length} agents: Balancer, Explorer, Wildcard.`);


    // === STAGE 2: EXECUTING SWARM ===
    job.stage = 'EXECUTING_SWARM';
    job.message = `Dispatching ${agentTasks.length} specialist agents...`;
    job.progress = 0;
    job.total = agentTasks.length;
    logToJob(jobId, '[Orchestrator] Dispatching specialist agents to run in parallel.');
    jobStore.set(jobId, job);
    
    const sharedScratchpad = new Set<string>();
    
    const agentPromises = agentTasks.map((task: any) => 
        runSpecialistAgent(task.agentName, task.persona, task.task, sharedScratchpad, ragContext)
            .then(result => {
                const currentJob = jobStore.get(jobId)!;
                currentJob.progress = (currentJob.progress || 0) + 1;
                logToJob(jobId, `[${result.agentName}] Agent finished. Found ${result.contributedPosts.length} posts. Report: "${result.log}"`);
                jobStore.set(jobId, currentJob);
                return result;
            })
    );
    
    const agentResults = await Promise.all(agentPromises);


    // === STAGE 3: SYNTHESIZING ===
    job.stage = 'SYNTHESIZING';
    job.message = 'Orchestrator is synthesizing agent findings...';
    logToJob(jobId, '[Orchestrator] All agents complete. Aggregating and synthesizing results...');
    jobStore.set(jobId, job);
    
    const allPosts = agentResults.flatMap(r => r.contributedPosts);
    
    if (allPosts.length === 0) {
        throw new Error('Swarm failed to retrieve any posts. Please try refining your query or running again.');
    }
    
    const synthesizerPrompt = orchestratorSynthesizerPrompt
        .replace('{RAW_POSTS}', JSON.stringify(allPosts));
        
    const finalResultJson = await callGemini(ai, synthesizerPrompt, "gemini-2.5-pro", true);
    
    const agentReports = agentResults.map(r => ({
      agentName: r.agentName,
      contributedPosts: r.contributedPosts,
      executedQueries: r.executedQueries,
      log: r.log
    }));

    const finalResult: SwarmJobResult = {
      finalPosts: finalResultJson.finalPosts,
      triggerSuggestions: finalResultJson.triggerSuggestions,
      agentReports: agentReports,
    };
    
    job.stage = 'COMPLETE';
    job.message = 'Job complete.';
    job.result = finalResult;
    logToJob(jobId, `[Orchestrator] Synthesis complete. Final batch of ${finalResult.finalPosts.length} posts prepared.`);
    jobStore.set(jobId, job);

  } catch (error: any) {
    if (job) {
      job.stage = 'FAILED';
      job.message = error.message;
      logToJob(jobId, `[Orchestrator] CRITICAL ERROR: ${error.message}`);
      jobStore.set(jobId, job);
    }
    console.error(`Job ${jobId} failed:`, error);
  }
}


// --- Specialist Agent Logic ---
async function runSpecialistAgent(
  agentName: SpecialistAgentResult['agentName'], 
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
      // This is where a real Google Search API call would go.
      // For this environment, we mock the results to simulate the agent's behavior.
      const snippets = Array.from({ length: 5 }, (_, i) => `Mock post from ${agentName} agent #${i}: ${task.slice(0, 50)}... This is a simulated search result for query '${executedQueries}'.`);
      result = await chat.sendMessage({ message: { functionResponses: [{id: call.id, name: call.name, response: { result: { snippets }}}] } });
    } else {
      break;
    }
  }

  const responseText = result.text.trim();
  try {
    const responseJson = JSON.parse(responseText.match(/\{.*\}/s)?.[0] || '{}');
    const posts = responseJson.retrieved_posts || [];
    
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
    runSwarmJob(jobId, datasetState, apoFeedback || [], manualQueries, ragContext);
    
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
