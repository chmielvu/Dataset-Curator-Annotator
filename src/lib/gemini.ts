import { GoogleGenAI } from "@google/genai";

export const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export function safeParseJSON(text: string) {
  try {
    // 1. Try direct parse
    return JSON.parse(text);
  } catch {
    // 2. Extract from markdown code blocks
    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match) {
      try { return JSON.parse(match[1]); } catch {}
    }
    // 3. Extract outermost braces
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      try { return JSON.parse(text.substring(start, end + 1)); } catch {}
    }
    return null;
  }
}