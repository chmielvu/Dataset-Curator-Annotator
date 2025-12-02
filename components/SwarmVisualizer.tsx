import React, { useState, useEffect, useRef, useMemo, FC, CSSProperties } from 'react';
import { CurationJob, SwarmJobResult } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

interface SwarmVisualizerProps {
  job: CurationJob | null;
  report: SwarmJobResult | null;
}

type AnimationState = 'idle' | 'planning' | 'dispatching' | 'working' | 'collecting' | 'finished';

const AGENT_CONFIG: Record<string, { cx: number; cy: number; color: string }> = {
  Balancer: { cx: 80, cy: 50, color: 'text-blue-400' },
  Explorer: { cx: 220, cy: 50, color: 'text-green-400' },
  Wildcard: { cx: 80, cy: 190, color: 'text-purple-400' },
  Manual: { cx: 220, cy: 190, color: 'text-slate-400' },
  // Fallback for unknown agents
  Unknown: { cx: 150, cy: 190, color: 'text-yellow-400' }
};

const ORCHESTRATOR_CONFIG = { cx: 150, cy: 120, color: 'text-rose-400' };
const QUEUE_CONFIG = { cx: 150, cy: 120 };

const SwarmVisualizer: FC<SwarmVisualizerProps> = ({ job, report }) => {
  const [animationState, setAnimationState] = useState<AnimationState>('idle');
  const [activeAgents, setActiveAgents] = useState<string[]>([]);
  const [particles, setParticles] = useState<{ id: number; agent: string }[]>([]);
  const [collectedCount, setCollectedCount] = useState<number | null>(null);
  const lastReportRef = useRef<SwarmJobResult | null>(null);

  useEffect(() => {
    let timers: ReturnType<typeof setTimeout>[] = [];
    const cleanup = () => timers.forEach(clearTimeout);

    if (!job?.isActive) {
        setAnimationState('idle');
        return cleanup;
    }

    if (report && report !== lastReportRef.current) {
        lastReportRef.current = report;
        const agentsInReport = report.agentReports.map(r => r.agentName);
        
        setAnimationState('dispatching');
        setActiveAgents(agentsInReport);
        setCollectedCount(null);

        timers.push(setTimeout(() => setAnimationState('working'), 500));
        
        timers.push(setTimeout(() => {
            setAnimationState('collecting');
            const newPostsCount = report.finalPosts.length;
            setCollectedCount(newPostsCount);
            const newParticles = report.agentReports.flatMap(r =>
                Array.from({ length: Math.min(r.contributedPosts.length, 5) }, () => ({
                    id: Math.random(),
                    agent: r.agentName,
                }))
            );
            setParticles(newParticles);
        }, 1500));

        timers.push(setTimeout(() => {
            setAnimationState('finished');
            setParticles([]);
            setCollectedCount(null);
        }, 2500));
    
    } else if (!report && (animationState === 'idle' || animationState === 'finished')) {
        setAnimationState('planning');
        setActiveAgents([]);
        setParticles([]);
        setCollectedCount(null);
    }

    return cleanup;
}, [job?.isActive, report, animationState]);


  const statusMessage = useMemo(() => {
    if (!job?.isActive) return 'Swarm is idle. Start a job to see activity.';
    switch (animationState) {
      case 'planning': return `Orchestrator: Planning tasks for batch ${job.batchesCompleted + 1}...`;
      case 'dispatching': return 'Orchestrator: Dispatching tasks to agents...';
      case 'working': return 'Agents: Searching for posts...';
      case 'collecting': return `Orchestrator: Synthesizing ${collectedCount ?? 0} posts...`;
      case 'finished': return 'Batch complete. Awaiting next cycle...';
      default: return 'Swarm is idle. Start a job to see activity.';
    }
  }, [animationState, job?.isActive, job?.batchesCompleted, collectedCount]);

  const agentIsActive = (agentName: string) => activeAgents.includes(agentName) && animationState !== 'idle' && animationState !== 'finished';
  const orchestratorIsActive = animationState === 'planning' || animationState === 'dispatching' || animationState === 'collecting';
  
  // Safe helper to get config or fallback
  const getAgentConfig = (name: string) => AGENT_CONFIG[name] || AGENT_CONFIG['Unknown'];

  // Only render agents that are known or active
  const agentsToRender = Array.from(new Set([...Object.keys(AGENT_CONFIG), ...activeAgents])).filter(k => k !== 'Unknown');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Swarm Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative w-full aspect-[3/2] max-w-sm mx-auto">
          <svg viewBox="0 0 300 240" className="w-full h-full">
            {/* Lines */}
            {agentsToRender.map(key => {
              const agent = getAgentConfig(key);
              const lineLength = Math.hypot(agent.cx - ORCHESTRATOR_CONFIG.cx, agent.cy - ORCHESTRATOR_CONFIG.cy);
              return (
                <path
                  key={`line-${key}`}
                  d={`M${ORCHESTRATOR_CONFIG.cx},${ORCHESTRATOR_CONFIG.cy} L${agent.cx},${agent.cy}`}
                  stroke="hsl(var(--border))"
                  strokeWidth="1"
                  strokeDasharray={lineLength}
                  strokeDashoffset={animationState === 'dispatching' && agentIsActive(key) ? 0 : lineLength}
                  style={{ transition: 'stroke-dashoffset 0.5s ease-out' }}
                />
              );
            })}
            
            {/* Nodes */}
            <g transform={`translate(${ORCHESTRATOR_CONFIG.cx}, ${ORCHESTRATOR_CONFIG.cy})`}>
              <circle r="25" fill="currentColor" className={orchestratorIsActive ? ORCHESTRATOR_CONFIG.color : 'text-muted-foreground'} />
              <circle r="30" fill="none" stroke="currentColor" strokeWidth="2" className={`${orchestratorIsActive ? `animate-pulse-strong ${ORCHESTRATOR_CONFIG.color}` : 'text-transparent'}`} />
              <text fill="white" fontSize="9" textAnchor="middle" dy=".3em" className="font-bold">Orch.</text>
            </g>

            {agentsToRender.map(key => {
              const agent = getAgentConfig(key);
              const isWorking = agentIsActive(key) && (animationState === 'working' || animationState === 'collecting');
              return (
                <g key={`agent-${key}`} transform={`translate(${agent.cx}, ${agent.cy})`}>
                  <circle r="18" fill="currentColor" className={`${agentIsActive(key) ? agent.color : 'text-muted-foreground'}`} />
                  <circle r="22" fill="none" stroke="currentColor" strokeWidth="2" className={`${isWorking ? `animate-pulse-strong ${agent.color}` : 'text-transparent'}`} />
                  <text fill="white" fontSize="8" textAnchor="middle" dy=".3em" className="font-bold">{key}</text>
                </g>
              );
            })}
              
            {collectedCount !== null && animationState === 'collecting' &&
                <g transform={`translate(${QUEUE_CONFIG.cx}, ${QUEUE_CONFIG.cy - 45})`}>
                    <text textAnchor="middle" className="text-lg font-bold fill-rose-500 dark:fill-rose-400 drop-shadow-md" style={{ animation: 'pulse-strong 0.5s ease-out' }}>
                        +{collectedCount} New Posts
                    </text>
                </g>
            }
          </svg>
          
           {particles.map(p => {
            const startConfig = getAgentConfig(p.agent);
            const startX = (startConfig.cx / 300) * 100;
            const startY = (startConfig.cy / 240) * 100;
            const endX = (QUEUE_CONFIG.cx / 300) * 100;
            const endY = (QUEUE_CONFIG.cy / 240) * 100;
            const translateX = startX - endX;
            const translateY = startY - endY;
            return (
              <div key={p.id} className={`absolute w-2 h-2 rounded-full bg-rose-500 animate-fly-to-queue`}
                style={{
                    top: `${endY}%`,
                    left: `${endX}%`,
                    '--tw-translate-x': `${translateX}%`,
                    '--tw-translate-y': `${translateY}%`,
                    animationDelay: `${Math.random() * 0.5}s`
                } as CSSProperties} />
            );
          })}
        </div>
        <p className="text-center text-xs text-muted-foreground -mt-4 min-h-[1.25rem]">{statusMessage}</p>
      </CardContent>
    </Card>
  );
};

export default SwarmVisualizer;