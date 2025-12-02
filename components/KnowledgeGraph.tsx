import React, { useEffect } from 'react';
import { ReactFlow, Background, Controls, MiniMap, useNodesState, useEdgesState, Node, Edge } from '@xyflow/react';

interface KnowledgeGraphProps {
    data: { nodes: Node[]; edges: Edge[] } | null;
}

const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({ data }) => {
    // Initialize with empty arrays or data if available
    const [nodes, setNodes, onNodesChange] = useNodesState(data?.nodes || []);
    const [edges, setEdges, onEdgesChange] = useEdgesState(data?.edges || []);

    // Update graph when data changes (e.g., after Gemini finishes calculation)
    useEffect(() => {
        if (data) {
            setNodes(data.nodes);
            setEdges(data.edges);
        }
    }, [data, setNodes, setEdges]);

    return (
        <div style={{ width: '100%', height: '500px' }} className="bg-zinc-950 rounded-lg border border-zinc-800 shadow-inner relative">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                fitView
                attributionPosition="bottom-left"
                colorMode="dark"
            >
                <Background gap={16} size={1} />
                <Controls />
                <MiniMap nodeColor={(n) => n.style?.background as string || '#fff'} />
            </ReactFlow>
        </div>
    );
};

export default KnowledgeGraph;