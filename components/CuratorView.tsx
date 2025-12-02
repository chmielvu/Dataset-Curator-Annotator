import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import SwarmVisualizer from './SwarmVisualizer';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Play, Square } from 'lucide-react';
import { db } from '../lib/dexie';
import { toast } from 'sonner';

export default function CuratorView() {
    const { curationJob, startCurationJob, stopCurationJob, lastSwarmReport, curationLog, initializeData } = useAppStore();
    const [batches, setBatches] = useState(3);
    const [query, setQuery] = useState('');

    const handleManualAdd = async () => {
        if (!query.trim()) return;
        await db.addPostsToQueue([query]);
        toast.success("Manual post added to queue");
        setQuery('');
        initializeData();
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Curator Swarm</h2>
                    <p className="text-muted-foreground">Autonomous Gemini Agent sourcing content via Thinking Mode.</p>
                </div>
                {curationJob?.isActive && <Badge variant="default" className="animate-pulse bg-green-500">THINKING</Badge>}
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <SwarmVisualizer job={curationJob} report={lastSwarmReport} />
                    
                    <Card>
                        <CardHeader>
                            <CardTitle>Manual Override</CardTitle>
                        </CardHeader>
                        <CardContent className="flex gap-2">
                            <Input 
                                value={query} 
                                onChange={(e) => setQuery(e.target.value)} 
                                placeholder="Enter specific query or raw text..." 
                            />
                            <Button onClick={handleManualAdd}>Add</Button>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card className="h-full flex flex-col">
                        <CardHeader>
                            <CardTitle>Mission Control</CardTitle>
                            <CardDescription>Configure and launch the swarm.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 flex-1">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Batch Count</label>
                                <Input type="number" value={batches} onChange={e => setBatches(parseInt(e.target.value))} min={1} max={20} disabled={curationJob?.isActive}/>
                            </div>
                            
                            {curationJob?.isActive ? (
                                <Button variant="destructive" className="w-full" onClick={stopCurationJob}>
                                    <Square className="mr-2 h-4 w-4 fill-current"/> Stop Mission
                                </Button>
                            ) : (
                                <Button className="w-full" onClick={() => startCurationJob(batches, query)}>
                                    <Play className="mr-2 h-4 w-4 fill-current"/> Launch Swarm
                                </Button>
                            )}

                            <div className="mt-6 border rounded-md p-3 bg-muted/50 h-[300px] overflow-y-auto font-mono text-xs space-y-1">
                                {curationLog.length === 0 && <span className="text-muted-foreground">System ready. Waiting for commands.</span>}
                                {curationLog.map((l, i) => (
                                    <div key={i} className="border-b border-border/50 pb-1 last:border-0">{l}</div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}