
// This is a server-side file.
import { GoogleGenAI } from "@google/genai";
import { masterCuratorPrompt } from '../../utils/prompts';
import { SwarmJobResult } from '../../types';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { datasetState, apoFeedback, manualQueries, ragContext } = req.body;

    if (!datasetState) {
      return res.status(400).json({ error: 'Missing required field: datasetState' });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const userInputContext = manualQueries 
      ? `The user has provided a high-priority manual query: "${manualQueries}".\n${ragContext ? `They also provided this RAG context from the local archive which may be relevant:\n${ragContext}\n` : ''}`
      : 'N/A';

    const prompt = masterCuratorPrompt
      .replace('{DATASET_STATE}', JSON.stringify(datasetState, null, 2))
      .replace('{APO_FEEDBACK}', JSON.stringify(apoFeedback || [], null, 2))
      .replace('{MANUAL_QUERIES}', userInputContext);

    // This single, synchronous call replaces the entire multi-agent, multi-step polling logic.
    // It uses a powerful model and Google Search grounding to perform the whole task in one go.
    // This is more robust for a serverless environment.
    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text;
    // Clean the text response before parsing.
    const cleanedText = text.replace(/^```json/, '').replace(/```$/, '').trim();
    const finalResult = JSON.parse(cleanedText) as SwarmJobResult;

    if (!finalResult.finalPosts || !Array.isArray(finalResult.finalPosts)) {
      throw new Error("Master Curator Agent returned invalid or missing 'finalPosts' in its JSON response.");
    }

    return res.status(200).json(finalResult);

  } catch (error: any) {
    console.error(`Error in /api/curator-swarm:`, error);
    const errorMessage = error.message || 'An unknown error occurred during curation.';
    return res.status(500).json({ 
        error: 'The Curator Swarm agent failed.',
        details: errorMessage
    });
  }
}
