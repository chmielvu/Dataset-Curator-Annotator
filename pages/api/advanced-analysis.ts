
// This is a server-side file.
import { GoogleGenAI } from "@google/genai";
import { pythonAnalysisScript } from '../../utils/prompts';

// This special tool is assumed to be available in the GAIS environment,
// allowing for the execution of a Python sandbox.
const CODE_EXECUTION_TOOL = {
  codeExecution: {}
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { feedbackLog } = req.body;

    if (!feedbackLog || !Array.isArray(feedbackLog)) {
      return res.status(400).json({ error: 'Missing or invalid feedbackLog data.' });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Inject the feedback log data into the Python script template
    const finalPythonScript = pythonAnalysisScript.replace(
      'json_data = """{JSON_PLACEHOLDER}"""',
      `json_data = """${JSON.stringify(feedbackLog)}"""`
    );

    const prompt = `Please execute the following Python script to analyze the provided data and return a base64 encoded PNG image of the resulting plot. Your output should ONLY be the raw base64 string. Do not add any commentary, explanations, or markdown fences.

\`\`\`python
${finalPythonScript}
\`\`\`
`;
    
    const response = await ai.models.generateContent({
        model: "gemini-2.5-pro", // Pro model is best for complex tool use and instruction following
        contents: prompt,
        tools: [CODE_EXECUTION_TOOL]
    });

    const responseText = response.text.trim();
    
    // Handle cases where the execution tool reports an error
    if (responseText.startsWith("ERROR:")) {
        throw new Error(`Python script execution failed: ${responseText.replace("ERROR:", "").trim()}`);
    }

    // A simple heuristic to validate the output: a base64 image string is long and has no spaces.
    // This makes the parsing robust, even if the response format isn't strictly defined.
    if (responseText.length > 500 && !responseText.includes(' ')) {
        return res.status(200).json({ base64Image: responseText });
    } else {
        console.error("Unexpected response from model:", responseText);
        throw new Error("Analysis agent did not return a valid base64 image string.");
    }

  } catch (error: any) {
    console.error('Error in /api/advanced-analysis:', error);
    return res.status(500).json({ 
      error: 'The advanced analysis agent failed to generate a report.',
      details: error.message 
    });
  }
}
