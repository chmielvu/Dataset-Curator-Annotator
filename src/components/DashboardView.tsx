
import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { toast } from 'sonner';
import { Network, Activity, FileText, Sparkles, BrainCircuit } from 'lucide-react';
import { db } from '../lib/dexie';
import { GeminiAdapter } from '../infrastructure/GeminiAdapter';
import KnowledgeGraph from './KnowledgeGraph';
import { getCleavageName, getTacticName } from '../utils/codex';

// Instantiate Adapter for component-level requests
const aiService = new GeminiAdapter();

export default function DashboardView() {
    const { datasetState } = useAppStore();
    const [graphData, setGraphData] = useState<any>(null);
    const [loadingGraph, setLoadingGraph] = useState(false);

    const generateGraph = async () => {
        setLoadingGraph(true);
        const toastId = toast.loading("Gemini 3 Pro is initializing Code Execution Sandbox...");
        try {
            const feedbackLog = await db.feedbackLog.toArray();
            if (feedbackLog.length === 0) throw new Error("Need verified annotations to build a meaningful graph.");

            const data = await aiService.generateKnowledgeGraph(feedbackLog);
            if (!data || (!data.nodes.length && !data.edges.length)) {
                 throw new Error("Model failed to generate graph data (output empty).");
            }
            
            setGraphData(data);
            toast.success("Graph Generated via Python NetworkX", { id: toastId });
        } catch(e: any) {
            toast.error("Generation Failed", { id: toastId, description: e.message });
        } finally {
            setLoadingGraph(false);
        }
    };

    const totalCleavageSignal = (Object.values(datasetState.cleavages) as number[]).reduce((a, b) => a + b, 0);

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Magdalenka Dashboard</h2>
                    <p className="text-muted-foreground">Neuro-symbolic Knowledge Graph powered by Gemini 3 Code Execution.</p>
                </div>
                <Button onClick={generateGraph} disabled={loadingGraph} className="gap-2 bg-purple-600 hover:bg-purple-700">
                    {loadingGraph ? <BrainCircuit className="animate-spin h-4 w-4"/> : <Sparkles className="h-4 w-4"/>}
                    {loadingGraph ? "Executing Python..." : "Build Graph (Gemini 3)"}
                </Button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Verified Posts</CardTitle>
                        <FileText className="h-4 w-4 text-muted-foreground"/>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{datasetState.total_annotations_processed}</div>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Signals</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground"/>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalCleavageSignal}</div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2 min-h-[500px] flex flex-col border-primary/20">
                     <CardHeader>
                        <CardTitle>Topology Visualizer</CardTitle>
                        <CardDescription>
                             Co-occurrence calculated by <code>networkx.spring_layout</code> in the Gemini Sandbox.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 p-0 relative overflow-hidden bg-black/5 dark:bg-black/20">
                        {loadingGraph && (
                            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-20 backdrop-blur-sm">
                                <div className="flex flex-col items-center gap-4">
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                                    <p className="font-mono text-sm text-muted-foreground animate-pulse text-center">
                                        &gt; python_sandbox_executing...<br/>
                                        &gt; calculating_layout_vectors...
                                    </p>
                                </div>
                            </div>
                        )}
                        
                        {graphData ? (
                            <KnowledgeGraph data={graphData} />
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-4">
                                <Network className="h-16 w-16 opacity-20" />
                                <div className="text-center max-w-sm">
                                    <p>No graph generated.</p>
                                    <p className="text-xs mt-1 opacity-70">Click "Build Graph" to run the Neuro-Symbolic Loop.</p>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <div className="space-y-6">
                    <Card>
                        <CardHeader><CardTitle>Top Cleavages</CardTitle></CardHeader>
                        <CardContent className="space-y-3">
                            {Object.entries(datasetState.cleavages)
                                .sort(([,a], [,b]) => (b as number) - (a as number))
                                .slice(0,5)
                                .map(([key, val]) => (
                                    <div key={key} className="flex justify-between items-center text-sm border-b pb-2 last:border-0">
                                        <span className="capitalize text-muted-foreground">{getCleavageName(key)}</span>
                                        <span className="font-mono font-bold text-primary">{val as number}</span>
                                    </div>
                                ))
                            }
                        </CardContent>
                    </Card>
                    
                    <Card>
                        <CardHeader><CardTitle>Top Tactics</CardTitle></CardHeader>
                        <CardContent className="space-y-3">
                            {Object.entries(datasetState.tactics)
                                .sort(([,a], [,b]) => (b as number) - (a as number))
                                .slice(0,5)
                                .map(([key, val]) => (
                                    <div key={key} className="flex justify-between items-center text-sm border-b pb-2 last:border-0">
                                        <span className="capitalize text-muted-foreground">{getTacticName(key)}</span>
                                        <span className="font-mono font-bold text-foreground">{val as number}</span>
                                    </div>
                                ))
                            }
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
