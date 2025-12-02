import { ai, parseJSONFromText } from './lib/gemini';
import { DatasetState, FeedbackLogEntry, SwarmJobResult, Annotation, QcAgentResult } from './types';
import { v4 as uuidv4 } from 'uuid';
import { SwarmJobResultSchema, AnnotationSchema, QcAgentResultSchema, KnowledgeGraphSchema } from './utils/schemas';
import { TACTIC_IDS, EMOTION_IDS } from './utils/constants';
import { getTacticName, getEmotionName } from './utils/codex';

// --- HELPERS ---
const TACTIC_NAMES = TACTIC_IDS.map(id => getTacticName(id)).join(", ");
const EMOTION_NAMES = EMOTION_IDS.map(id => getEmotionName(id)).join(", ");

// --- SYSTEM PROMPTS & PERSONAS ---

const SYSTEM_INSTRUCTION_SWARM = `
You are the **Magdalenka Curator Swarm**, an advanced multi-agent orchestration system running on Gemini 3 Pro.
Your goal is to source high-quality, relevant social media content from the Polish internet to balance a sociopolitical dataset.

**OPERATIONAL PROTOCOL:**
1. **PLAN**: Analyze the current dataset state. Identify under-represented cleavages (Post-Peasant, Economic Anxiety, etc.).
2. **DISPATCH**: Act as three sub-agents simultaneously:
    - **Balancer**: Specifically targets missing data points.
    - **Explorer**: Looks for emerging topics/outliers.
    - **Wildcard**: Uses lateral thinking and creative queries.
3. **EXECUTE**: Use 'googleSearch' to find REAL content.
4. **SYNTHESIZE**: Deduplicate and return a clean JSON payload.
`;

const SYSTEM_INSTRUCTION_ANNOTATOR = `
You are the **Magdalenka Auto-Annotator** (v3.0), a precise analytical engine.
Your job is to map Polish social media text onto the 5-dimensional 'Magdalenka Codex' vector space.
Maintain a clinical, objective tone.
`;

const SYSTEM_INSTRUCTION_QC = `
You are the **Quality Control Supervisor**. Your role is to critique annotations with extreme rigor.
You detect logical fallacies, mismatched labels, and hallucinations.
You provide structured JSON feedback to update the UI.
`;

// --- ACTIONS ---

/**
 * AGENT 1: CURATOR SWARM (Gemini 3 Pro)
 * Utilizes Thinking Mode for planning complex search strategies.
 * Implements "Zero Temp Rule" for grounded search.
 */
export async function runCurationSwarmAction(
    datasetState: DatasetState, 
    manualQueries: string, 
    apoFeedback: FeedbackLogEntry[]
): Promise<SwarmJobResult> {
    
    const prompt = `
    **MISSION BRIEFING**:
    - **Dataset State**: ${JSON.stringify(datasetState)}
    - **Recent Feedback**: ${JSON.stringify(apoFeedback)}
    - **User Override**: "${manualQueries}"

    **EXECUTION STEPS**:
    1. Formulate 3 distinct search strategies based on the agent personas (Balancer, Explorer, Wildcard).
    2. Execute Google Searches for these strategies.
    3. Extract exactly 5-10 high-quality unique post texts (tweets, headlines, comments).
    4. Return the result in the strict JSON format defined below.
    `;

    try {
        const result = await ai.models.generateContent({
            model: 'gemini-3-pro-preview', 
            contents: prompt,
            config: {
                systemInstruction: SYSTEM_INSTRUCTION_SWARM,
                tools: [{ googleSearch: {} }],
                responseMimeType: 'application/json',
                temperature: 0, // SOTA: Zero Temp Rule for Search
                thinkingConfig: { thinkingBudget: 4096 }, // High reasoning for planning
            }
        });

        const rawData = parseJSONFromText(result.text || "{}");
        
        // Zod Validation - Fail fast if model hallucinates schema
        const validatedData = SwarmJobResultSchema.parse(rawData);
        return validatedData;

    } catch (e: any) {
        console.error("Curator Swarm Error:", e);
        // Return a safe fallback structure compliant with the schema
        return {
            finalPosts: [],
            triggerSuggestions: [],
            agentReports: [{ 
                agentName: "Manual", 
                contributedPosts: [], 
                executedQueries: "System Error", 
                log: `Swarm crashed: ${e.message}` 
            }]
        };
    }
}

/**
 * AGENT 2: AUTO-ANNOTATOR (Gemini 2.5 Flash)
 * Optimized for speed and throughput. Code execution used for precise counting if needed.
 * Strictly constrained to Codex vocabulary.
 */
export async function runAutoAnnotatorAction(post: string): Promise<Annotation> {
    const prompt = `
    Analyze this text: "${post}"
    
    **CODEX DEFINITIONS**:
    - **Valid Tactics**: ${TACTIC_NAMES}
    - **Valid Emotions**: ${EMOTION_NAMES}
    
    **OUTPUT REQUIREMENT**:
    Output strictly adhering to the schema:
    - labels: Array<float> [Post-Peasant, Economic Anxiety, Sovereigntist, Generational, Trauma]
    - tactics: Array<string> (Must be exact matches from Valid Tactics list)
    - emotion_fuel: string (Must be exact match from Valid Emotions list)
    - stance_label: "AGAINST" | "FOR" | "NEUTRAL"
    - stance_target: string
    `;

    try {
        const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                systemInstruction: SYSTEM_INSTRUCTION_ANNOTATOR,
                tools: [{ codeExecution: {} }],
                responseMimeType: 'application/json',
            }
        });

        const rawData = parseJSONFromText(result.text || "{}");
        const validated = AnnotationSchema.parse(rawData);

        return {
            ...validated,
            id: uuidv4(),
            text: post,
            confidence: 0.95 // 2.5 Flash is confident!
        };
    } catch (e: any) {
        console.error("Annotator Error:", e);
        throw new Error(`Annotation failed: ${e.message}`);
    }
}

/**
 * AGENT 3: QC SUPERVISOR (Gemini 3 Pro)
 * High reasoning model to check for subtle inconsistencies.
 */
export async function runQCAgentAction(post: string, annotation: Annotation): Promise<QcAgentResult> {
    const prompt = `
    **AUDIT REQUEST**:
    TEXT: "${post}"
    ANNOTATION: ${JSON.stringify(annotation)}

    **CRITERIA**:
    1. Are the 'labels' consistent with the 'tactics'? (e.g. Loaded Language implies high emotion).
    2. Is the 'stance_target' explicitly present or heavily implied?
    3. Is the 'emotion_fuel' accurate to the tone?

    Provide structured JSON feedback with specific UI suggestions for the editor.
    `;

    try {
        const result = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: prompt,
            config: {
                systemInstruction: SYSTEM_INSTRUCTION_QC,
                responseMimeType: 'application/json',
                thinkingConfig: { thinkingBudget: 2048 }
            }
        });

        const rawData = parseJSONFromText(result.text || "{}");
        return QcAgentResultSchema.parse(rawData);

    } catch (e: any) {
        console.error("QC Agent Error:", e);
        return {
            qc_passed: false,
            feedback: `QC System Failure: ${e.message}`,
            ui_suggestions: []
        };
    }
}

/**
 * AGENT 4: KNOWLEDGE GRAPH ENGINEER (Gemini 3 Pro + Python)
 * The "Neuro-Symbolic Loop" - executes Python to generate strict JSON for React Flow.
 * Implements "Iron Sandbox" safety protocol.
 */
export async function runKnowledgeGraphAction(feedbackLog: FeedbackLogEntry[]) {
    // We strictly follow the "Python-to-JSON-to-React" bridge pattern
    const nodesData = JSON.stringify(feedbackLog.slice(0, 100).map(f => ({
        id: f.id,
        tactics: f.correctedAnnotation.tactics,
        cleavages: f.correctedAnnotation.labels
    })));

    const prompt = `
    You are a Network Scientist using 'networkx'.
    
    **DATA**: ${nodesData}
    
    **TASK**:
    1. Parse the data. Create a graph G.
    2. Add nodes for TACTICS (Blue) and CLEAVAGES (Pink).
    3. Add edges weighted by co-occurrence.
    4. Run 'nx.spring_layout(G, k=0.8, iterations=50, seed=42)' to calculate X/Y coordinates.
    5. Export the graph to a JSON object compatible with React Flow.
    
    **IRON SANDBOX PROTOCOL**:
    import json
    import networkx as nx
    import traceback
    
    # Define fallback function to ensure JSON is always printed
    def safe_print(data):
        print(json.dumps(data))

    try:
        # Build your graph G here based on 'nodesData'
        # [Placeholder for python logic]
        # nodes = ...
        # edges = ...
        
        # NOTE: This is a simulated environment prompt. 
        # The python code you generate MUST perform the actual logic on the input data.
        # DO NOT print the mockup data below. You must calculate the nodes and edges from 'nodesData'.
        
        # FINAL STEP:
        # result = { "nodes": [...], "edges": [...] }
        # safe_print(result)
        
    except Exception:
        safe_print({"error": traceback.format_exc(), "nodes": [], "edges": []})
        
    **CONSTRAINT**:
    - Tactics Nodes Style: { "background": "#2563eb", "color": "white", "width": 120 }
    - Cleavage Nodes Style: { "background": "#db2777", "color": "white", "width": 150 }
    
    GENERATE THE PYTHON CODE TO PERFORM THE ANALYSIS AND PRINT VALID JSON.
    `;

    try {
        const result = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: prompt,
            config: {
                tools: [{ codeExecution: {} }],
                // No responseMimeType for code execution usually, but we want the final print to be JSON.
                thinkingConfig: { thinkingBudget: 4096 } 
            }
        });
        
        // The model usually prints the JSON in the executable output or final text
        // We look for the executable result first
        let jsonString = "";
        
        // Try to find the output from the execution
        const executablePart = result.candidates?.[0]?.content?.parts?.find(p => p.executableCodeResult);
        if (executablePart?.executableCodeResult?.outcome === 'OUTCOME_OK') {
             jsonString = executablePart.executableCodeResult.output || "";
        } else {
             // Fallback to text parsing if it printed it in chat
             jsonString = result.text || "";
        }

        const rawGraph = parseJSONFromText(jsonString);
        return KnowledgeGraphSchema.parse(rawGraph);

    } catch (e: any) {
        console.error("KG Generation Error:", e);
        throw new Error(`Graph generation failed: ${e.message}`);
    }
}
