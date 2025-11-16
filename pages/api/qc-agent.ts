
// This is a server-side file.
import { GoogleGenAI } from "@google/genai";
import { qcAgentPrompt } from '../../utils/prompts';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { post, annotation, codex } = req.body;

    if (!post || !annotation || !codex) {
      return res.status(400).json({ error: 'Missing required fields: post, annotation, codex' });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const model = "gemini-2.5-pro"; // QC requires strong reasoning
    
    const prompt = qcAgentPrompt
      .replace('{POST}', JSON.stringify(post))
      .replace('{ANNOTATION}', JSON.stringify(annotation))
      .replace('{CODEX}', JSON.stringify(codex));

    const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
        }
    });

    const responseJson = JSON.parse(response.text);

    return res.status(200).json({ qcResult: responseJson });

  } catch (error: any) {
    console.error('Error in /api/qc-agent:', error);
    return res.status(500).json({ 
      error: 'Failed to get valid JSON response from QC agent.',
      details: error.message 
    });
  }
}
