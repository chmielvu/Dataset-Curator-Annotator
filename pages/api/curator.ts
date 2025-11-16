
// This is a server-side file.
import { GoogleGenAI } from "@google/genai";
import { curatorPrompt } from '../../utils/prompts';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { datasetState, strategy } = req.body;

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const prompt = curatorPrompt
      .replace('{DATASET_STATE}', JSON.stringify(datasetState, null, 2))
      .replace('{STRATEGY}', strategy);

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
            tools: [{googleSearch: {}}],
        },
    });

    const postText = response.text;

    if (!postText) {
        throw new Error("Model did not return any text from search.");
    }
    
    return res.status(200).json({ postText: postText.trim() });

  } catch (error: any) {
    console.error("Error in /api/curator:", error);
    return res.status(500).json({ error: error.message });
  }
}
