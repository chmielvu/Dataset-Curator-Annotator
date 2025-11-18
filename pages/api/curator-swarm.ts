// This is a server-side file.
import { GoogleGenAI, FunctionDeclarationsTool, Type } from "@google/genai";
import { pythonSwarmScript } from '../../utils/prompts';
import { SwarmJobResult } from '../../types';

// Define the GAIS-native tools we will make available to our Python script
const CODE_EXECUTION_TOOL: FunctionDeclarationsTool = {
  codeExecution: {}
};

// This tool provides the 'google_search' module to the Python sandbox
const GROUNDING_TOOL: FunctionDeclarationsTool = {
  functionDeclarations: [{
    name: 'google_search',
    description: "Search Google for a list of queries. Use advanced operators like 'site:x.com' to find authentic comments, not news articles.",
    parameters: { type: Type.OBJECT, properties: { queries: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ['queries'] }
  }]
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { datasetState, apoFeedback, manualQueries, ragContext, precomputedTasks } = req.body;

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // --- RAG Context Refinement Step ---
    let refinedRagContext = ragContext || '';
    if (manualQueries && ragContext) {
      const selectionPrompt = `
You are a highly efficient assistant. Your task is to select the most relevant text snippets from a provided context that will help answer a user's search query.

**Instructions:**
1. Read the search query to understand the user's intent.
2. Read through all the provided context snippets.
3. Select up to the top 3 snippets that are most directly relevant to the query.
4. Return ONLY these selected snippets, concatenated together. Do not add any commentary, headings, or explanations.

**Search Query:**
"${manualQueries}"

**Context Snippets:**
${ragContext}

**Your Response (only the most relevant snippets):**
`;
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: selectionPrompt,
        });
        refinedRagContext = response.text.trim();
      } catch (e) {
        console.warn('RAG context refinement failed, using full context as fallback.', e);
        // Fallback to using the original ragContext if refinement fails
        refinedRagContext = ragContext; 
      }
    }
    // --- End RAG Context Refinement ---

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
        `RAG_CONTEXT = """${refinedRagContext.replace(/"/g, '\\"')}"""`
      )
      .replace(
        'PRECOMPUTED_TASKS = json.loads("""{PRECOMPUTED_TASKS}""")',
        `PRECOMPUTED_TASKS = json.loads("""${JSON.stringify(precomputedTasks || [])}""")`
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
