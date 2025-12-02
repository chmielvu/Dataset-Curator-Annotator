import { GoogleGenAI } from "@google/genai";

export const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Safely parses JSON from a model response, handling Markdown code blocks,
 * conversational fluff, and common LLM formatting patterns.
 */
export function parseJSONFromText(text: string): any {
  if (!text) return null;
  
  // 1. Attempt direct parse (Fastest)
  try {
    return JSON.parse(text);
  } catch (e) {
    // Continue to advanced strategies
  }

  // 2. Extract from Markdown code blocks (e.g. ```json ... ```)
  const markdownMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (markdownMatch) {
    try {
      return JSON.parse(markdownMatch[1]);
    } catch (e) {
      console.warn("Found code block but failed to parse JSON:", e);
    }
  }

  // 3. Robust "Outer Braces" Finder
  // Finds the first '{' and the last '}' to extract the main JSON object
  const firstOpen = text.indexOf('{');
  const lastClose = text.lastIndexOf('}');
  
  if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
    const candidate = text.substring(firstOpen, lastClose + 1);
    try {
      return JSON.parse(candidate);
    } catch (e) {
       // Ignore, might be partial or malformed
    }
  }

  // 4. Robust "Outer Brackets" Finder (For Arrays)
  const firstOpenArr = text.indexOf('[');
  const lastCloseArr = text.lastIndexOf(']');
  
  if (firstOpenArr !== -1 && lastCloseArr !== -1 && lastCloseArr > firstOpenArr) {
    const candidate = text.substring(firstOpenArr, lastCloseArr + 1);
    try {
      return JSON.parse(candidate);
    } catch (e) {
       // Ignore
    }
  }

  console.warn("Failed to extract JSON from text. Raw text preview:", text.substring(0, 100));
  return null;
}