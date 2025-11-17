// This is a server-side file.
import { GoogleGenAI } from "@google/genai";
import { annotatorPrompt } from '../../utils/prompts';
import { v4 as uuidv4 } from 'uuid';
import * as CODEX from '../../public/Magdalenka Codex Classification.json';
import * as SCHEMA from '../../public/BERT_finetuning_magdalenka_schema.json';

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

    const prompt = annotatorPrompt
      .replace('{POST}', JSON.stringify(post))
      .replace('{CODEX}', JSON.stringify(CODEX))
      .replace('{SCHEMA}', JSON.stringify(SCHEMA))
      .replace('{APO_FEEDBACK}', feedbackText);
    
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

    const confidence = responseJson.cleavages && Array.isArray(responseJson.cleavages) && responseJson.cleavages.length > 0
        ? Math.max(...responseJson.cleavages)
        : 0;

    const finalAnnotation = {
      ...responseJson,
      id: uuidv4(),
      text: post,
      confidence,
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
