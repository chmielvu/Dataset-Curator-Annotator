
// This is a server-side file.
import { GoogleGenAI } from "@google/genai";
import { pythonSwarmScript } from '../../utils/prompts';
import { SwarmJobResult } from '../../types';

// Define the GAIS-native tools we will make available to our Python script
const CODE_EXECUTION_TOOL = {
  codeExecution: {}
};

// This tool provides the 'google_search' module to the Python sandbox
const GROUNDING_TOOL = {
  googleSearch: {}
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { datasetState, apoFeedback, manualQueries, ragContext } = req.body;

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // 1. Inject the request data into the Python script template
    const finalPythonScript = pythonSwarmScript
      .replace(
        'DATASET_STATE = json.loads("""{DATASET_STATE}""")',
        `DATASET_STATE = json.loads("""${JSON.stringify(datasetState || {})}""")`
      )
      .replace(
        'APO_FEEDBACK = json.loads("""{APO_FEEDBACK}""")',
        `APO_FEEDBACK = json.loads("""${JSON.stringify(apoFeedback || [])}""")`
      )
      .replace(
        'MANUAL_QUERIES = """{MANUAL_QUERIES}"""',
        `MANUAL_QUERIES = """${manualQueries || ''}"""`
      )
      .replace(
        'RAG_CONTEXT = """{RAG_CONTEXT}"""',
        `RAG_CONTEXT = """${ragContext || ''}"""`
      );
    
    // 2. Create the prompt for the model, asking it to run our Python script
    const prompt = `
Please execute the following Python script in the sandbox environment to run the curator swarm.
The script has access to the 'google_search' tool.

The script will perform all steps (planning, agent execution, synthesis) and will
print a single JSON string as its final output.

Your response should ONLY be that final JSON output, with no commentary or markdown.

\`\`\`python
${finalPythonScript}
\`\`\`
`;

    // 3. Call the model synchronously and wait for it to run the script
    const response = await ai.models.generateContent({
        model: "gemini-2.5-pro", // Use Pro for complex, multi-step tool use
        contents: prompt,
        tools: [CODE_EXECUTION_TOOL, GROUNDING_TOOL]
    });

    const responseText = response.text.trim();
    
    // 4. Parse the JSON output from the Python script
    let responseJson: SwarmJobResult;
    try {
        // Find the JSON part of the response, which might be wrapped in markdown
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error("No JSON object found in the model's response.");
        }
        responseJson = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
        console.error('Failed to parse JSON from Python script:', responseText);
        throw new Error('The swarm script returned a response that was not valid JSON.');
    }

    // 5. Return the result directly to the client
    return res.status(200).json({ swarmResult: responseJson });

  } catch (error: any) {
    console.error('Error in /api/curator-swarm:', error);
    return res.status(500).json({ 
      error: 'Failed to run curator swarm.',
      details: error.message 
    });
  }
}
