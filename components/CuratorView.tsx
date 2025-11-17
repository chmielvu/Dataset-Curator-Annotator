import React from 'react';
import { useState, useEffect, useRef } from 'react';
import { DatasetState, SwarmJobStatus, SwarmJobResult } from '../types';
import { useEmbedding } from '../hooks/useEmbedding';
import { db } from '../lib/dexie';

interface CuratorViewProps {
  datasetState: DatasetState;
  onPostsFound: (result: SwarmJobResult) => void;
  onError: (error: string | null) => void;
}

const CuratorView: React.FC<CuratorViewProps> = ({ datasetState, onPostsFound, onError }) => {
  const [jobStatus, setJobStatus] = useState<SwarmJobStatus | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [manualPost, setManualPost] = useState('');
  const [manualQueries, setManualQueries] = useState('');
  const [lastSearchReport, setLastSearchReport] = useState<SwarmJobResult | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [copyButtonText, setCopyButtonText] = useState('Copy Suggestions');
  
  const { isReady: isEmbeddingReady, isLoading: isEmbeddingLoading, generateEmbedding, initializationError } = useEmbedding();
  const pollingIntervalRef = useRef<number | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const isLoading = jobStatus && jobStatus.stage !== 'IDLE' && jobStatus.stage !== 'COMPLETE' && jobStatus.stage !== 'FAILED';

  // Polling logic
  useEffect(() => {
    if (jobId && isLoading) {
      pollingIntervalRef.current = window.setInterval(async () => {
        try {
          const response = await fetch(`/api/curator-swarm?jobId=${jobId}`);
          if (!response.ok) throw new Error('Failed to fetch job status.');

          const status: SwarmJobStatus = await response.json();
          setJobStatus(status);

          if (status.stage === 'COMPLETE') {
            onPostsFound(status.result!);
            setLastSearchReport(status.result!);
            setJobId(null);
            setJobStatus(null);
          } else if (status.stage === 'FAILED') {
            onError(`Swarm job failed: ${status.message}`);
            setJobId(null);
            setJobStatus(null);
          }
        } catch (error) {
          console.error('Polling error:', error);
          onError('Lost connection to the curation swarm.');
          setJobId(null);
          setJobStatus(null);
        }
      }, 2000);
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [jobId, isLoading, onPostsFound, onError]);
  
    useEffect(() => {
      if (logContainerRef.current) {
        logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
      }
    }, [jobStatus?.log]);

  const handleRunAgent = async () => {
    if (manualPost.trim() && !manualQueries.trim()) {
      const manualResult: SwarmJobResult = {
        finalPosts: [manualPost.trim()],
        triggerSuggestions: [],
        agentReports: [{
          agentName: 'Manual',
          contributedPosts: [manualPost.trim()],
          executedQueries: 'N/A - Manual Post Entry',
          log: 'Post was entered manually, bypassing agent swarm.'
        }]
      }
      onPostsFound(manualResult);
      setLastSearchReport(manualResult);
      setManualPost('');
      return;
    }

    onError(null);
    setShowReport(false);
    setJobStatus({ jobId: '', stage: 'PLANNING', message: 'Initializing job...', log: [`[${new Date().toLocaleTimeString()}] [Orchestrator] Initializing job...`] });

    let recentFeedback = [];
    try {
      recentFeedback = await db.getRecentFeedback(5);
    } catch (err) {
      console.warn("Could not fetch APO feedback:", err);
    }
    
    const bodyPayload: any = { datasetState, apoFeedback: recentFeedback };

    if (manualQueries.trim()) {
      bodyPayload.manualQueries = manualQueries.trim();
      if (isEmbeddingReady && generateEmbedding) {
        try {
          const queryEmbedding = await generateEmbedding(manualQueries.trim());
          const searchResults = await db.findSimilar(queryEmbedding, 3);
          if (searchResults.length > 0) {
            bodyPayload.ragContext = searchResults.map((r, i) => `[Reference ${i+1}]: "${r.text}"`).join('\n');
          }
        } catch (ragErr) {
          console.warn("RAG search failed during job start, proceeding without it.", ragErr);
        }
      }
    }

    try {
      const response = await fetch('/api/curator-swarm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Server returned a non-JSON error.' }));
        throw new Error(errData.error || 'Failed to start the swarm job.');
      }
      const { jobId: newJobId } = await response.json();
      setJobId(newJobId);

    } catch (err: any) {
      onError(err.message);
      setJobStatus(null);
    }
  };
  
  const handleCopySuggestions = () => {
    if (lastSearchReport?.triggerSuggestions) {
      const textToCopy = lastSearchReport.triggerSuggestions.join('\n');
      navigator.clipboard.writeText(textToCopy).then(() => {
        setCopyButtonText('Copied!');
        setTimeout(() => setCopyButtonText('Copy Suggestions'), 2000);
      }, (err) => {
        console.error('Could not copy text: ', err);
        setCopyButtonText('Copy Failed');
        setTimeout(() => setCopyButtonText('Copy Suggestions'), 2000);
      });
    }
  };
  
  const getButtonText = () => {
    if (isLoading) return 'Swarm is Running...';
    return 'Run Curator Swarm (Batch of 10)';
  };

  const RagStatusIndicator = () => {
    let statusColor, statusText;
    if (isEmbeddingLoading) {
      statusColor = 'text-yellow-600 dark:text-yellow-400';
      statusText = 'RAG Initializing...';
    } else if (initializationError) {
      statusColor = 'text-red-600 dark:text-red-400';
      statusText = 'RAG Failed';
    } else if (isEmbeddingReady) {
      statusColor = 'text-green-600 dark:text-green-400';
      statusText = 'RAG Ready';
    } else {
        statusColor = 'text-gray-500 dark:text-gray-400';
        statusText = 'RAG Unavailable';
    }

    return (
      <div className={`flex items-center space-x-2 px-3 py-1 rounded-full border ${
          isEmbeddingLoading ? 'border-yellow-300 dark:border-yellow-600 bg-yellow-50 dark:bg-yellow-900/30' : 
          initializationError ? 'border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/30' : 
          isEmbeddingReady ? 'border-green-300 dark:border-green-600 bg-green-50 dark:bg-green-900/30' : 
          'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800'
      }`}>
        <span className={`h-2 w-2 rounded-full ${
            isEmbeddingLoading ? 'bg-yellow-500 animate-pulse' : 
            initializationError ? 'bg-red-500' : 
            isEmbeddingReady ? 'bg-green-500' : 
            'bg-gray-400'
        }`}></span>
        <span className={`text-xs font-semibold ${statusColor}`}>{statusText}</span>
      </div>
    );
  };


  return (
    <section className="p-6 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50">
      <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">1. Autonomous Planner-Curator Agent</h2>
      <p className="mt-2 text-gray-600 dark:text-gray-400">The Orchestrator agent will analyze the dataset, deploy a swarm of specialist agents, and synthesize their findings to retrieve a batch of posts.</p>
      
      <div className="my-6 space-y-4 bg-white dark:bg-gray-800 p-4 rounded-lg border dark:border-gray-700">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            <div className="md:col-span-2">
                <button onClick={handleRunAgent} disabled={!!isLoading} className="w-full px-4 py-3 text-white bg-rose-700 rounded-md hover:bg-rose-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-rose-500 disabled:bg-rose-500 dark:disabled:bg-rose-900 disabled:cursor-not-allowed transition-all duration-200 ease-in-out flex items-center justify-center font-semibold text-base">
                    {isLoading ? (
                        <><svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        {getButtonText()}</>
                    ) : getButtonText()}
                </button>
            </div>
            <div className="flex justify-center md:justify-end">
                <RagStatusIndicator />
            </div>
        </div>
        {isLoading && jobStatus && (
          <div className="p-4 bg-gray-100 dark:bg-gray-900 rounded-lg border dark:border-gray-700 space-y-2">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{jobStatus.message}</p>
            <div ref={logContainerRef} className="h-48 overflow-y-auto bg-black text-white font-mono text-xs p-3 rounded-md scroll-smooth">
              {(jobStatus.log || []).map((entry, index) => (
                <p key={index} className="whitespace-pre-wrap animate-fade-in">{entry}</p>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-200 mb-2">Manual Search Queries <span className="text-sm font-normal text-gray-500">(RAG-Augmented)</span></h3>
          <textarea
            value={manualQueries}
            onChange={(e) => setManualQueries(e.target.value)}
            placeholder="e.g., 'Discuss the impact of Zielony Ład on small farms.' The agent swarm will use this for RAG-augmented search."
            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-rose-500 focus:border-rose-500 transition disabled:bg-gray-200 dark:disabled:bg-gray-700"
            rows={2}
            disabled={!!isLoading}
          />
        </div>
        <div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-200 mb-2">Manual Post Entry (Bypasses Agent)</h3>
          <div className="flex items-start space-x-2">
            <textarea
              value={manualPost}
              onChange={(e) => setManualPost(e.target.value)}
              placeholder="Paste text here to send it directly to the Annotator."
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-rose-500 focus:border-rose-500 transition disabled:bg-gray-200 dark:disabled:bg-gray-700"
              rows={3}
              disabled={!!isLoading}
            />
            <button 
              onClick={handleRunAgent} 
              disabled={!manualPost.trim() || !!isLoading}
              className="px-4 py-2 text-white bg-rose-700 rounded-md hover:bg-rose-800 disabled:bg-rose-500 dark:disabled:bg-rose-900"
            >
              Submit
            </button>
          </div>
        </div>
      </div>

      {lastSearchReport && (
          <button onClick={() => setShowReport(!showReport)} className="w-full text-sm mt-6 text-gray-600 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 py-2 px-4 rounded-md transition-colors">
            {showReport ? 'Hide' : 'Show'} Last Swarm Report
          </button>
      )}

      {showReport && lastSearchReport && (
        <div className="mt-4 p-4 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-500/30 rounded-lg space-y-4">
            {lastSearchReport.agentReports.map((report, index) => (
                <div key={index} className="p-3 bg-white dark:bg-gray-700/50 rounded-lg border dark:border-gray-600">
                    <h4 className="font-semibold text-sm text-rose-800 dark:text-rose-300">Report from Agent: <span className="font-mono bg-rose-100 dark:bg-rose-900/50 text-rose-900 dark:text-rose-200 px-2 py-0.5 rounded-md">{report.agentName}</span></h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{report.log}</p>
                    <p className="text-xs font-semibold mt-2">Contributed {report.contributedPosts.length} post(s).</p>
                </div>
            ))}
            {lastSearchReport.triggerSuggestions && lastSearchReport.triggerSuggestions.length > 0 && (
              <div className="p-3">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-sm">Orchestrator's Trigger Suggestions:</span>
                    <button onClick={handleCopySuggestions} className="text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-900/50 hover:bg-rose-200 dark:hover:bg-rose-900 px-2 py-1 rounded-md transition-colors">
                      {copyButtonText}
                    </button>
                  </div>
                   <div className="mt-2 text-gray-800 dark:text-gray-200 text-xs space-y-1">
                      {lastSearchReport.triggerSuggestions.map((suggestion, index) => (
                        <p key={index} className="font-mono p-2 bg-yellow-50 dark:bg-yellow-900/30 border-l-2 border-yellow-400">{suggestion}</p>
                      ))}
                  </div>
                   <p className="text-xs text-gray-500 mt-1">The agent suggests adding these to <code>unified_triggers.json</code> to improve future autonomous searches.</p>
              </div>
            )}
        </div>
      )}
    </section>
  );
};

export default CuratorView;