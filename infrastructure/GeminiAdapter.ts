
import { ai, parseJSONFromText } from '../lib/gemini';
import { IAIService } from '../core/interfaces';
import { DatasetState, FeedbackLogEntry, SwarmJobResult, Annotation, QcAgentResult } from '../types';
import { SwarmJobResultSchema, AnnotationSchema, QcAgentResultSchema, KnowledgeGraphSchema } from '../utils/schemas';
import { v4 as uuidv4 } from 'uuid';
import { TACTIC_IDS, EMOTION_IDS } from '../utils/constants';
import { getTacticName, getEmotionName } from '../utils/codex';
import { SYSTEM_INSTRUCTION_SWARM, SYSTEM_INSTRUCTION_ANNOTATOR, SYSTEM_INSTRUCTION_QC, KG_PROMPT_TEMPLATE } from './prompts';

const TACTIC_NAMES = TACTIC_IDS.map(id => getTacticName(id)).join(", ");
const EMOTION_NAMES = EMOTION_IDS.map(id => getEmotionName(id)).join(", ");

export class GeminiAdapter implements IAIService {
    
    async runCuratorSwarm(datasetState: DatasetState, manualQuery: string, feedback: FeedbackLogEntry[]): Promise<SwarmJobResult> {
        const prompt = `
        **MISSION BRIEFING**:
        - **Dataset State**: ${JSON.stringify(datasetState)}
        - **Recent Feedback**: ${JSON.stringify(feedback)}
        - **User Override**: "${manualQuery}"

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
                    temperature: 0,
                    thinkingConfig: { thinkingBudget: 4096 },
                }
            });

            const rawData = parseJSONFromText(result.text || "{}");
            return SwarmJobResultSchema.parse(rawData);
        } catch (e: any) {
            console.error("Curator Swarm Error:", e);
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

    async runAutoAnnotator(postText: string): Promise<Annotation> {
        const prompt = `
        Analyze this text: "${postText}"
        
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
                text: postText,
                confidence: 0.95
            };
        } catch (e: any) {
            throw new Error(`Annotation failed: ${e.message}`);
        }
    }

    async runQCCheck(postText: string, annotation: Annotation): Promise<QcAgentResult> {
        const prompt = `
        **AUDIT REQUEST**:
        TEXT: "${postText}"
        ANNOTATION: ${JSON.stringify(annotation)}

        **CRITERIA**:
        1. Are the 'labels' consistent with the 'tactics'?
        2. Is the 'stance_target' explicitly present or heavily implied?
        3. Is the 'emotion_fuel' accurate to the tone?

        Provide structured JSON feedback with specific UI suggestions.
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
            return {
                qc_passed: false,
                feedback: `QC System Failure: ${e.message}`,
                ui_suggestions: []
            };
        }
    }

    async generateKnowledgeGraph(feedbackLog: FeedbackLogEntry[]): Promise<any> {
        const nodesData = feedbackLog.slice(0, 100).map(f => ({
            id: f.id,
            tactics: f.correctedAnnotation.tactics,
            cleavages: f.correctedAnnotation.labels
        }));
        
        const base64Data = btoa(unescape(encodeURIComponent(JSON.stringify(nodesData))));
        const prompt = KG_PROMPT_TEMPLATE(base64Data);

        try {
            const result = await ai.models.generateContent({
                model: 'gemini-3-pro-preview',
                contents: prompt,
                config: {
                    tools: [{ codeExecution: {} }],
                    thinkingConfig: { thinkingBudget: 4096 } 
                }
            });
            
            let jsonString = "";
            const executablePart = result.candidates?.[0]?.content?.parts?.find(p => p.executableCodeResult);
            if (executablePart?.executableCodeResult?.outcome === 'OUTCOME_OK') {
                 jsonString = executablePart.executableCodeResult.output || "";
            } else {
                 jsonString = result.text || "";
            }

            const rawGraph = parseJSONFromText(jsonString);
            return KnowledgeGraphSchema.parse(rawGraph);
        } catch (e: any) {
            console.error(e);
            throw new Error(`Graph generation failed. Logic error in Python execution.`);
        }
    }
}
