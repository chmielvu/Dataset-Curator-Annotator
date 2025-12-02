import React, { useState } from 'react';
import { ReactFlow, Background, Controls, MiniMap, useNodesState, useEdgesState } from '@xyflow/react';
import { db } from '../../lib/db';
import { runKnowledgeGraphGen } from '../../actions';
import { Sparkles, Loader2, Network } from 'lucide-react';
import { toast } from 'sonner';

export default function KnowledgeGraph() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const posts = await db.posts.where('status').equals('annotated').toArray();
      if (posts.length === 0) throw new Error("No annotated posts found. Use the Curator & Annotator first.");
      
      toast.info("Gemini 3 Pro: Executing Python NetworkX...");
      const data = await runKnowledgeGraphGen(posts);
      
      if (data.nodes && data.nodes.length > 0) {
        setNodes(data.nodes);
        setEdges(data.edges);
        toast.success(`Generated Graph: ${data.nodes.length} nodes`);
      } else {
        throw new Error(data.error || "Model returned empty graph.");
      }
    } catch (e: any) {
      toast.error(`Graph failed: ${e.message}`);
    }
    setLoading(false);
  };

  return (
    <div className="h-full flex flex-col space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Neuro-Symbolic Graph</h2>
          <p className="text-xs text-muted-foreground">Powered by Python NetworkX in Gemini Sandbox</p>
        </div>
        <button 
          onClick={generate} 
          disabled={loading}
          className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 disabled:opacity-50 transition-colors shadow-lg shadow-purple-900/20"
        >
          {loading ? <Loader2 className="animate-spin w-4 h-4"/> : <Sparkles className="w-4 h-4"/>}
          Build Graph
        </button>
      </div>
      
      <div className="flex-1 border rounded-lg overflow-hidden bg-zinc-950 relative shadow-inner min-h-[500px]">
        {nodes.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground pointer-events-none">
            <Network className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-lg font-medium">Graph is empty</p>
            <p className="text-sm opacity-50">Run analysis to visualize connections</p>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            colorMode="dark"
            fitView
          >
            <Background color="#333" gap={20} />
            <Controls />
            <MiniMap nodeColor={(n) => n.style?.background as string || '#fff'} />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}