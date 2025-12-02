import React from 'react';
import { useStore } from '../../store';
import { db } from '../../lib/db';
import { runCuratorSwarm } from '../../actions';
import { Play, Square, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

export default function Curator() {
  const { isSwarmActive, setSwarmActive, swarmLog, addSwarmLog, datasetState, refreshStats } = useStore();

  const handleStart = async () => {
    setSwarmActive(true);
    addSwarmLog("Initializing Gemini 3 Pro Swarm...");
    
    try {
      // 1. Plan & Execute
      addSwarmLog("Planning search strategies (Thinking Mode)...");
      const result = await runCuratorSwarm(datasetState);
      
      addSwarmLog(`Agents Dispatched: ${result.agents.map((a: any) => a.name).join(', ')}`);
      
      const allPosts = result.agents.flatMap((a: any) => a.posts);
      addSwarmLog(`Synthesized ${allPosts.length} unique posts.`);

      // 2. Save to DB
      await db.posts.bulkAdd(allPosts.map((text: string) => ({
        text, status: 'queued', source: 'swarm', timestamp: new Date().toISOString()
      })));
      
      toast.success(`Swarm found ${allPosts.length} posts`);
      refreshStats();
    } catch (e: any) {
      addSwarmLog(`Error: ${e.message}`);
      toast.error("Swarm failed");
    } finally {
      setSwarmActive(false);
      addSwarmLog("Mission Complete.");
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Curator Swarm</h2>
        {isSwarmActive && <span className="animate-pulse text-green-500 font-mono text-sm">● THINKING</span>}
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-4">
          <div className="border rounded-lg bg-card p-6 h-[400px] relative overflow-hidden flex flex-col items-center justify-center">
            {/* Vibe Visualization */}
            <div className="relative w-full h-full flex items-center justify-center">
               <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary/10 to-transparent opacity-50" />
               <motion.div 
                 animate={{ rotate: isSwarmActive ? 360 : 0 }} 
                 transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                 className="w-32 h-32 border-4 border-dashed border-primary/30 rounded-full"
               />
               <div className="absolute font-mono text-xs text-center space-y-2">
                 {isSwarmActive ? "AGENTS ACTIVE" : "IDLE"}
               </div>
            </div>
          </div>
        </div>

        <div className="col-span-1 space-y-4">
          <div className="border rounded-lg bg-card p-4 h-[400px] flex flex-col">
            <h3 className="font-semibold mb-4 text-sm">Mission Log</h3>
            <div className="flex-1 overflow-auto font-mono text-xs space-y-2 text-muted-foreground">
              {swarmLog.map((l, i) => (
                <div key={i} className="border-b border-border/50 pb-1">{l}</div>
              ))}
            </div>
            <div className="pt-4 mt-auto">
              <button
                onClick={handleStart}
                disabled={isSwarmActive}
                className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2 rounded-md font-medium hover:opacity-90 disabled:opacity-50 transition-all"
              >
                {isSwarmActive ? <Loader2 className="animate-spin h-4 w-4"/> : <Play className="h-4 w-4"/>}
                {isSwarmActive ? "Orchestrating..." : "Launch Swarm"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}