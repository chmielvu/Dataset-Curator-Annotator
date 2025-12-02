import { ai, safeParseJSON } from './lib/gemini';
import { z } from 'zod';
import { TACTIC_IDS, EMOTION_IDS, DEFINITIONS } from './lib/codex';

// --- SCHEMAS ---
const SwarmResultSchema = z.object({
  agents: z.array(z.object({
    name: z.string(),
    query: z.string(),
    posts: z.array(z.string())
  }))
});

const AnnotationSchema = z.object({
  labels: z.array(z.number()).length(5),
  tactics: z.array(z.string()),
  emotion_fuel: z.string(),
  stance_label: z.enum(["AGAINST", "FOR", "NEUTRAL"]),
  stance_target: z.string(),
  confidence: z.number().optional()
});

const QcResultSchema = z.object({
  qc_passed: z.boolean(),
  feedback: z.string(),
  suggestions: z.record(z.string(), z.any()).optional()
});

// --- ACTIONS ---

export async function runCuratorSwarm(context: any) {
  const prompt = `
    You are the Curator Swarm Orchestrator.
    Current Context: ${JSON.stringify(context)}
    
    PLANNING PHASE:
    1. Identify missing data niches (cleavages).
    2. Dispatch 3 agents: 'Balancer', 'Explorer', 'Wildcard'.
    3. Generate specific Google Search queries for each.
    
    EXECUTION PHASE:
    - Use googleSearch tool.
    - Return JSON: { agents: [{ name, query, posts: [text, text...] }] }
  `;

  try {
    const res = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        thinkingConfig: { thinkingBudget: 2048 },
        responseMimeType: 'application/json'
      }
    });
    return SwarmResultSchema.parse(safeParseJSON(res.text || "{}"));
  } catch (e) {
    console.error(e);
    throw new Error("Swarm failed to coordinate.");
  }
}

export async function runAnnotator(text: string) {
  // Inject definitions for SOTA accuracy
  const defs = Object.entries(DEFINITIONS).map(([k, v]) => `- ${k}: ${v}`).join('\n');
  
  const prompt = `
    Analyze this text: "${text}"
    
    CODEX DEFINITIONS:
    ${defs}
    
    Valid Tactics: ${TACTIC_IDS.join(', ')}
    Valid Emotions: ${EMOTION_IDS.join(', ')}
    
    Return strict JSON matching schema.
  `;
  
  const res = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: { responseMimeType: 'application/json' }
  });
  
  return AnnotationSchema.parse(safeParseJSON(res.text || "{}"));
}

export async function runQC(text: string, annotation: any) {
  const prompt = `
    Audit this annotation.
    Text: "${text}"
    Annotation: ${JSON.stringify(annotation)}
    
    Check for:
    1. Logical consistency (e.g. Loaded Language implies high emotion).
    2. Missing tags.
    
    Return JSON: { qc_passed: bool, feedback: string, suggestions: { field: value } }
  `;

  const res = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: { 
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: 1024 }
    }
  });
  
  return QcResultSchema.parse(safeParseJSON(res.text || "{}"));
}

export async function runKnowledgeGraphGen(data: any[]) {
  // SOTA: Iron Sandbox Pattern (Base64 + Python NetworkX)
  // Ensure we send enough data to build a graph, but not exceed limits
  const minimalData = data.map(d => ({
    id: d.id,
    tactics: d.annotation?.tactics || [],
    emotion: d.annotation?.emotion_fuel
  }));
  
  const base64Data = btoa(unescape(encodeURIComponent(JSON.stringify(minimalData))));
  
  const prompt = `
    You are a Network Scientist using Python.
    
    TASK:
    1. Decode the Base64 data (a list of posts with tactics/emotions).
    2. Build a NetworkX graph where:
       - Nodes are Tactics and Emotions.
       - Edges represent co-occurrence in the same post.
       - Node size reflects frequency.
    3. Compute layout using 'spring_layout'.
    4. Print the result as a valid JSON object compatible with React Flow.
    
    REACT FLOW SCHEMA:
    {
      "nodes": [
        { "id": "str", "position": { "x": float, "y": float }, "data": { "label": "str" }, "style": { ... } }
      ],
      "edges": [
        { "id": "str", "source": "str", "target": "str", "animated": true }
      ]
    }
    
    INPUT DATA (Base64): "${base64Data}"
    
    Generate and execute the Python code.
  `;

  const pythonCode = `
import networkx as nx
import json
import base64
import random

try:
    # 1. Load Data
    raw = base64.b64decode("${base64Data}").decode('utf-8')
    items = json.loads(raw)
    
    G = nx.Graph()
    frequencies = {}
    
    # 2. Build Graph
    for item in items:
        # Connect all tactics to the emotion
        emotion = item.get('emotion')
        tactics = item.get('tactics', [])
        
        if emotion:
            G.add_node(emotion, type='emotion')
            frequencies[emotion] = frequencies.get(emotion, 0) + 1
            
        for t in tactics:
            G.add_node(t, type='tactic')
            frequencies[t] = frequencies.get(t, 0) + 1
            if emotion:
                G.add_edge(t, emotion)
            
            # Connect tactics to each other
            for t2 in tactics:
                if t != t2:
                    G.add_edge(t, t2)

    # 3. Layout
    if len(G.nodes) > 0:
        pos = nx.spring_layout(G, k=2.0, iterations=50, seed=42)
    else:
        pos = {}

    # 4. Format for React Flow
    nodes = []
    edges = []
    
    for node_id in G.nodes():
        x, y = pos[node_id]
        # Scale up coordinates
        x = float(x) * 400
        y = float(y) * 300
        
        freq = frequencies.get(node_id, 1)
        size = 20 + (freq * 5)
        
        node_type = G.nodes[node_id].get('type', 'unknown')
        color = '#db2777' if node_type == 'emotion' else '#2563eb'
        
        nodes.append({
            "id": node_id,
            "position": {"x": x, "y": y},
            "data": {"label": node_id},
            "style": {
                "background": color,
                "color": "white",
                "width": 100 + (freq*2),
                "fontSize": 10
            }
        })
        
    for i, (u, v) in enumerate(G.edges()):
        edges.append({
            "id": f"e{i}",
            "source": u,
            "target": v,
            "animated": True,
            "style": {"stroke": "#555"}
        })
        
    print(json.dumps({"nodes": nodes, "edges": edges}))

except Exception as e:
    # Fallback empty graph on error
    print(json.dumps({"nodes": [], "edges": [], "error": str(e)}))
`;

  try {
    const res = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: [
        { text: prompt },
        { 
          executableCode: {
            language: "PYTHON",
            code: pythonCode
          }
        }
      ],
      config: { 
        tools: [{ codeExecution: {} }] 
      }
    });

    const execResult = res.candidates?.[0]?.content?.parts?.find(p => p.executableCodeResult);
    const jsonStr = execResult?.executableCodeResult?.output || res.text || "{}";
    
    return safeParseJSON(jsonStr);
  } catch (e) {
    console.error(e);
    return { nodes: [], edges: [] };
  }
}