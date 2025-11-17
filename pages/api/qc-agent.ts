
// This is a server-side file.
import { GoogleGenAI } from "@google/genai";
import { qcAgentPrompt } from '../../utils/prompts';
import * as CODEX from '../../public/Magdalenka Codex Classification.json';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { post, annotation } = req.body;

    if (!post || !annotation) {
      return res.status(400).json({ error: 'Missing required fields: post, annotation' });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const prompt = qcAgentPrompt
      .replace('{POST}', JSON.stringify(post))
      .replace('{ANNOTATION}', JSON.stringify(annotation, null, 2))
      .replace('{CODEX}', JSON.stringify(CODEX, null, 2));

    const response = await ai.models.generateContent({
        model: "gemini-2.5-pro", // Pro is better for complex JSON and reasoning
        contents: prompt,
        config: {
            responseMimeType: "application/json",
        }
    });

    const cleanedText = response.text.replace(/^```json/, '').replace(/```$/, '').trim();
    const responseJson = JSON.parse(cleanedText);

    // Ensure ui_suggestions is always an array
    if (!responseJson.ui_suggestions) {
        responseJson.ui_suggestions = [];
    }

    return res.status(200).json({ qcResult: responseJson });

  } catch (error: any)
   {
    console.error('Error in /api/qc-agent:', error);
    return res.status(500).json({ 
      error: 'Failed to get valid JSON response from QC agent.',
      details: error.message 
    });
  }
}