import { GoogleGenAI } from "@google/genai";

export const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Safely parses JSON from a model response, handling Markdown code blocks.
 */
export function parseJSONFromText(text: string): any {
  if (!text) return null;
  try {
    // Attempt direct parse
    return JSON.parse(text);
  } catch (e) {
    // Attempt to extract from markdown ```json ... ``` or just {...}
    const match = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[1] || match[0]);
      } catch (e2) {
        console.warn("Failed to parse extracted JSON block:", e2);
        return null;
      }
    }
    console.warn("No JSON structure found in text:", text);
    return null;
  }
}