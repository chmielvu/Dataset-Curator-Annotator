
// This is a server-side file.
import { GoogleGenAI } from "@google/genai";
import { annotatorPrompt } from '../../utils/prompts';
import { v4 as uuidv4 } from 'uuid'; 

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { post, codex, schema } = req.body;

    if (!post || !codex || !schema) {
      return res.status(400).json({ error: 'Missing required fields: post, codex, schema' });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const prompt = annotatorPrompt
      .replace('{POST}', JSON.stringify(post))
      .replace('{CODEX}', JSON.stringify(codex))
      .replace('{SCHEMA}', JSON.stringify(schema));
    
    const response = await ai.models.generateContent({
        model: "gemini-2.5-pro",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            thinkingConfig: { thinkingBudget: 32768 },
        }
    });

    const responseText = response.text;
    let responseJson;

    try {
        responseJson = JSON.parse(responseText);
    } catch (parseError) {
        console.error('Failed to parse JSON from model:', responseText);
        throw new Error('The model returned a response that was not valid JSON.');
    }

    const finalAnnotation = {
      ...responseJson,
      id: uuidv4(),
      text: post,
    };

    return res.status(200).json({ annotation: finalAnnotation });

  } catch (error: any) {
    console.error('Error in /api/annotator:', error);
    return res.status(500).json({ 
      error: 'Failed to get valid JSON response from Annotator agent.',
      details: error.message 
    });
  }
}
