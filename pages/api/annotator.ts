
// This is a server-side file.
import { GoogleGenAI } from "@google/genai";
import {
  annotatorPoTPlannerPrompt,
  annotatorPoTWorkerCleavagePrompt,
  annotatorPoTWorkerTacticPrompt,
  annotatorPoTWorkerStancePrompt,
  annotatorPoTCriticPrompt
} from '../../utils/prompts';
import { v4 as uuidv4 } from 'uuid';
import * as CODEX from '../../public/Magdalenka Codex Classification.json';
import * as SCHEMA from '../../public/BERT_finetuning_magdalenka_schema.json';

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
        // Clean the text response before parsing.
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


export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { post, apoFeedback } = req.body;

    if (!post) {
      return res.status(400).json({ error: 'Missing required field: post' });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const feedbackText = (apoFeedback && apoFeedback.length > 0)
        ? `Here is the recent feedback to learn from:\n${JSON.stringify(apoFeedback, null, 2)}`
        : 'No feedback available.';

    // N1 (Planner): Create the analysis plan
    const plannerPrompt = annotatorPoTPlannerPrompt
      .replace('{POST}', post)
      .replace('{CODEX_SUMMARY}', JSON.stringify(CODEX.labels, null, 2));
    const analysisPlan = await callGemini(ai, plannerPrompt);

    // N2 (Workers): Execute analysis tasks in parallel
    const workerPayload = {
        POST: post,
        CODEX: JSON.stringify(CODEX, null, 2),
        ANALYSIS_PLAN: analysisPlan
    };
    const cleavagePrompt = annotatorPoTWorkerCleavagePrompt.replace(/{(\w+)}/g, (match, key) => (workerPayload as any)[key]);
    const tacticPrompt = annotatorPoTWorkerTacticPrompt.replace(/{(\w+)}/g, (match, key) => (workerPayload as any)[key]);
    const stancePrompt = annotatorPoTWorkerStancePrompt.replace(/{(\w+)}/g, (match, key) => (workerPayload as any)[key]);

    const [cleavageResult, tacticResult, stanceResult] = await Promise.all([
        callGemini(ai, cleavagePrompt, "gemini-2.5-flash", true),
        callGemini(ai, tacticPrompt, "gemini-2.5-flash", true),
        callGemini(ai, stancePrompt, "gemini-2.5-flash", true)
    ]);

    // N3 (Aggregator): Combine worker results
    const combinedAnnotation = {
        ...cleavageResult,
        ...tacticResult,
        ...stanceResult,
    };

    // N4 (Critic): Review, correct, and finalize the annotation
    const criticPrompt = annotatorPoTCriticPrompt
        .replace('{POST}', post)
        .replace('{COMBINED_ANNOTATION}', JSON.stringify(combinedAnnotation, null, 2))
        .replace('{SCHEMA}', JSON.stringify(SCHEMA, null, 2))
        .replace('{APO_FEEDBACK}', feedbackText);

    // Use a more powerful model for the final, critical step
    const finalJson = await callGemini(ai, criticPrompt, "gemini-2.5-pro", true);

    const confidence = finalJson.cleavages && Array.isArray(finalJson.cleavages) && finalJson.cleavages.length > 0
        ? Math.max(...finalJson.cleavages)
        : 0;

    const finalAnnotation = {
      ...finalJson,
      id: uuidv4(),
      text: post,
      confidence,
    };

    return res.status(200).json({ annotation: finalAnnotation });

  } catch (error: any) {
    console.error('Error in /api/annotator PoT workflow:', error);
    return res.status(500).json({ 
      error: 'The Program-of-Thought Annotator agent failed.',
      details: error.message 
    });
  }
}
