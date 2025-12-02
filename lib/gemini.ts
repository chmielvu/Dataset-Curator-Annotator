
import { GoogleGenAI } from "@google/genai";

// SOTA: Support both Vite's import.meta.env and legacy process.env
const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || process.env.API_KEY || process.env.GEMINI_API_KEY;

// PREVENT CRASH: If key is missing, use a placeholder.
// The SDK won't throw immediately on 'new', only when you try to make a call.
export const ai = new GoogleGenAI({ 
  apiKey: apiKey || "MISSING_API_KEY_PLACEHOLDER" 
});

/**
 * Safely parses JSON from a model response.
 * Handles Markdown code blocks and raw JSON.
 */
export function parseJSONFromText(text: string): any {
  if (!text) return null;
  
  try {
    // 1. Attempt direct parse
    return JSON.parse(text);
  } catch (e) {
    // 2. Extract from Markdown code blocks
    const markdownMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (markdownMatch) {
      try { return JSON.parse(markdownMatch[1]); } catch (e2) { /* ignore */ }
    }
  }
  return null;
}
