
import React from 'react';
import { useState, useEffect, useRef } from 'react';
import { DatasetState, SwarmJobStatus, SwarmJobResult, SpecialistAgentResult } from '../types';
import { useEmbedding } from '../hooks/useEmbedding';
import { db } from '../lib/dexie';

interface CuratorViewProps {
  datasetState: DatasetState;
  onPostsFound: (result: SwarmJobResult) => void;
  onError: (error: string | null) => void;
}

const getAgentStyles = (agentName: SpecialistAgentResult['agentName']) => {
  switch (agentName) {
    case 'Balancer':
      return { bg: 'bg-blue-500', text: 'text-blue-500', border: 'border-blue-200 dark:border-blue-500/30', cardBg: 'bg-blue-50 dark:bg-blue-900/30' };
    case 'Explorer':
      return { bg: 'bg-green-500', text: 'text-green-500', border: 'border-green-200 dark:border-green-500/30', cardBg: 'bg-green-50 dark:bg-green-900/30' };
    case 'Wildcard':
      return { bg: 'bg-purple-500', text: 'text-purple-500', border: 'border-purple-200 dark:border-purple-500/30', cardBg: 'bg-purple-50 dark:bg-purple-900/30' };
    default: // Manual
      return { bg: 'bg-slate-500', text: 'text-slate-500', border: 'border-slate-200 dark:border-slate-600', cardBg: 'bg-slate-50 dark:bg-slate-800/50' };
  }
};


const CuratorView: React.FC<CuratorViewProps> = ({ datasetState, onPostsFound, onError }) => {
  const [jobStatus, setJobStatus] = useState<SwarmJobStatus | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [manualPost, setManualPost] = useState('');
  const [manualQueries, setManualQueries] = useState('');
  const [lastSearchReport, setLastSearchReport] = useState<SwarmJobResult | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [copyButtonText, setCopyButtonText] = useState('Copy Suggestions');
  const [batchStatus, setBatchStatus] = useState<{
    fileName: string;
    processed: number;
    total: number;
    found: number;
    errors: number;
  } | null>(null);

  
  const { isReady: isEmbeddingReady, isLoading: isEmbeddingLoading, generateEmbedding, initializationError } = useEmbedding();
  const pollingIntervalRef = useRef<number | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const isLoading = jobStatus && jobStatus.stage !== 'IDLE' && jobStatus.stage !== 'COMPLETE' && jobStatus.stage !== 'FAILED';
  const isProcessingFile = batchStatus !== null;

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
            setShowReport(true);
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

  const handleManualSubmit = () => {
    if (manualPost.trim()) {
      const manualResult: SwarmJobResult = {
        finalPosts: [manualPost.trim()],
        triggerSuggestions: [],
        agentReports: [{
          agentName: 'Manual',
          contributedPosts: [manualPost.trim()],
          executedQueries: 'N/A - Manual Post Entry',
          log: 'Post was entered manually, bypassing agent swarm.'
        }]
      };
      onPostsFound(manualResult);
      setLastSearchReport(manualResult);
      setManualPost('');
    }
  };

  const handleBatchUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.jsonl')) {
        onError("Invalid file type. Please select a .jsonl file.");
        return;
    }

    onError(null);
    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim() !== '');
    const totalLines = lines.length;

    if (totalLines === 0) {
      onError("File is empty or contains no processable lines.");
      event.target.value = '';
      return;
    }
    
    setBatchStatus({
      fileName: file.name,
      processed: 0,
      total: totalLines,
      found: 0,
      errors: 0
    });

    const posts: string[] = [];
    const errorMessages: string[] = [];
    let currentIndex = 0;
    const CHUNK_SIZE = 250; // Process lines in chunks to avoid freezing the UI

    const processNextChunk = () => {
      const batchEnd = Math.min(currentIndex + CHUNK_SIZE, totalLines);
      let chunkFound = 0;
      let chunkErrors = 0;

      for (let i = currentIndex; i < batchEnd; i++) {
        try {
          const json = JSON.parse(lines[i]);
          if (typeof json.text === 'string' && json.text.trim() !== '') {
            posts.push(json.text.trim());
            chunkFound++;
          } else {
            errorMessages.push(`Line ${i + 1}: Missing or empty 'text' field.`);
            chunkErrors++;
          }
        } catch (e) {
          errorMessages.push(`Line ${i + 1}: Invalid JSON.`);
          chunkErrors++;
        }
      }

      setBatchStatus(prev => prev ? ({
        ...prev,
        processed: batchEnd,
        found: prev.found + chunkFound,
        errors: prev.errors + chunkErrors,
      }) : null);

      currentIndex = batchEnd;

      if (currentIndex < totalLines) {
        setTimeout(processNextChunk, 0); // Yield to main thread
      } else {
        // Finished processing
        setTimeout(() => { // Short delay to let the user see the 100% complete bar
          if (errorMessages.length > 0) {
              const errorMessage = `Parsed file with ${errorMessages.length} error(s):\n- ${errorMessages.slice(0, 5).join('\n- ')}`;
              onError(errorMessage + (errorMessages.length > 5 ? `\n...and ${errorMessages.length - 5} more.` : ''));
          }
          if (posts.length > 0) {
              const batchResult: SwarmJobResult = {
                  finalPosts: posts,
                  triggerSuggestions: [],
                  agentReports: [{
                      agentName: 'Manual',
                      contributedPosts: posts,
                      executedQueries: 'N/A - Manual Batch Upload',
                      log: `Batch of ${posts.length} posts was uploaded from file: ${file.name}.`
                  }]
              };
              onPostsFound(batchResult);
              setLastSearchReport(batchResult);
          } else if (errorMessages.length === 0) {
               onError("File is valid but contains no posts with a 'text' field.");
          }
          setBatchStatus(null);
        }, 500);
      }
    };
    
    processNextChunk(); // Start the processing loop
    event.target.value = ''; // Reset file input immediately
  };

  const handleRunAgent = async () => {
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
    let statusColor, statusText, pulse;
    if (isEmbeddingLoading) {
      [statusColor, statusText, pulse] = ['text-yellow-600 dark:text-yellow-400', 'RAG Initializing...', true];
    } else if (initializationError) {
      [statusColor, statusText, pulse] = ['text-red-600 dark:text-red-400', 'RAG Failed', false];
    } else if (isEmbeddingReady) {
      [statusColor, statusText, pulse] = ['text-green-600 dark:text-green-400', 'RAG Ready', false];
    } else {
      [statusColor, statusText, pulse] = ['text-slate-500 dark:text-slate-400', 'RAG Unavailable', false];
    }

    return (
      <div className={`flex items-center space-x-2 px-3 py-1 rounded-full border dark:border-slate-700/50 bg-slate-100 dark:bg-slate-800`}>
        <span className={`h-2 w-2 rounded-full ${isEmbeddingLoading ? 'bg-yellow-500' : initializationError ? 'bg-red-500' : isEmbeddingReady ? 'bg-green-500' : 'bg-slate-400'} ${pulse ? 'animate-pulse' : ''}`}></span>
        <span className={`text-xs font-semibold ${statusColor}`}>{statusText}</span>
      </div>
    );
  };


  return (
    <section className="p-4 sm:p-6 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/50">
      <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100">1. Autonomous Planner-Curator Agent</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">The Orchestrator agent will analyze the dataset, deploy a swarm of specialist agents, and synthesize their findings to retrieve a batch of posts.</p>
      
      <div className="my-6 space-y-4 bg-white dark:bg-slate-900/30 p-4 rounded-lg border dark:border-slate-700/50">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            <div className="md:col-span-2">
                <button onClick={handleRunAgent} disabled={!!isLoading || isProcessingFile} className="w-full px-4 py-3 text-white bg-rose-600 rounded-md hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-rose-500 disabled:bg-rose-400 dark:disabled:bg-rose-800 disabled:cursor-not-allowed transition-all duration-200 ease-in-out flex items-center justify-center font-semibold text-base shadow-lg shadow-rose-500/10 hover:shadow-xl hover:shadow-rose-500/20">
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
          <div className="p-4 bg-slate-100 dark:bg-slate-900/50 rounded-lg border dark:border-slate-700/50 space-y-2">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{jobStatus.message}</p>
            <div ref={logContainerRef} className="h-48 overflow-y-auto bg-slate-900 dark:bg-black text-slate-200 font-mono text-xs p-3 rounded-md scroll-smooth border border-slate-700/50">
              {(jobStatus.log || []).map((entry, index) => (
                <p key={index} className="whitespace-pre-wrap animate-fade-in">{entry}</p>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900/30 p-4 rounded-lg border dark:border-slate-700/50">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-200 mb-2">Manual Search Queries <span className="text-sm font-normal text-slate-500">(RAG-Augmented)</span></h3>
          <textarea
            value={manualQueries}
            onChange={(e) => setManualQueries(e.target.value)}
            placeholder="e.g., 'Discuss the impact of Zielony Ład on small farms.'"
            className="w-full p-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:ring-rose-500 focus:border-rose-500 transition disabled:bg-slate-200 dark:disabled:bg-slate-700 bg-white dark:bg-slate-800"
            rows={2}
            disabled={!!isLoading || isProcessingFile}
          />
           <p className="text-xs text-slate-500 mt-1">The agent swarm will use this for RAG-augmented search.</p>
        </div>
         <div className="bg-white dark:bg-slate-900/30 p-4 rounded-lg border dark:border-slate-700/50 space-y-4">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-200 mb-2">Manual Entry <span className="text-sm font-normal text-slate-500">(Bypasses Agent)</span></h3>
          
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Submit a single post:</p>
            <div className="flex items-start space-x-2">
              <textarea
                value={manualPost}
                onChange={(e) => setManualPost(e.target.value)}
                placeholder="Paste text here to send it directly to the Annotator."
                className="w-full p-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:ring-rose-500 focus:border-rose-500 transition disabled:bg-slate-200 dark:disabled:bg-slate-700 bg-white dark:bg-slate-800"
                rows={2}
                disabled={!!isLoading || isProcessingFile}
              />
              <button 
                onClick={handleManualSubmit} 
                disabled={!manualPost.trim() || !!isLoading || isProcessingFile}
                className="px-4 py-2 text-sm font-semibold text-white bg-rose-600 rounded-md hover:bg-rose-700 disabled:bg-rose-400 dark:disabled:bg-rose-800"
              >
                Submit
              </button>
            </div>
          </div>
          
           <div className="relative">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-slate-300 dark:border-slate-600"></div>
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white dark:bg-slate-900/30 px-2 text-sm text-slate-500">Or</span>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Upload a batch of posts:</p>
            {batchStatus ? (
                <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-lg border dark:border-slate-700/50 space-y-2">
                    <div className="flex justify-between items-center text-sm">
                        <p className="font-medium text-slate-700 dark:text-slate-300 truncate pr-4" title={batchStatus.fileName}>
                            Processing: {batchStatus.fileName}
                        </p>
                        <p className="font-mono text-slate-500 dark:text-slate-400">
                            {batchStatus.processed}/{batchStatus.total}
                        </p>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-2.5">
                        <div 
                            className="bg-rose-600 h-2.5 rounded-full transition-all duration-150" 
                            style={{ width: `${(batchStatus.processed / batchStatus.total) * 100}%` }}>
                        </div>
                    </div>
                     <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                        <span>Found: <span className="font-semibold text-green-600 dark:text-green-400">{batchStatus.found}</span></span>
                        <span>Errors: <span className="font-semibold text-red-600 dark:text-red-400">{batchStatus.errors}</span></span>
                    </div>
                </div>
            ) : (
              <>
                <label className={`inline-flex items-center px-4 py-2 border border-slate-300 dark:border-slate-500 shadow-sm text-sm font-medium rounded-md text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-600 hover:bg-slate-50 dark:hover:bg-slate-500 transition-colors ${isLoading || isProcessingFile ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    <span>Upload .jsonl Batch</span>
                    <input type="file" className="hidden" onChange={handleBatchUpload} disabled={!!isLoading || isProcessingFile} accept=".jsonl" />
                </label>
                <p className="text-xs text-slate-500">Each line must be a JSON object with a "text" field, e.g., `{"text": "This is a post."}`</p>
              </>
            )}
          </div>
        </div>
      </div>

      {lastSearchReport && (
          <button onClick={() => setShowReport(!showReport)} className="w-full text-sm mt-6 text-slate-600 dark:text-slate-300 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 py-2 px-4 rounded-md transition-colors">
            {showReport ? 'Hide' : 'Show'} Last Swarm Report
          </button>
      )}

      {showReport && lastSearchReport && (
        <div className="mt-4 p-4 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg space-y-4">
          <h3 className="font-semibold text-lg text-slate-800 dark:text-slate-100">Last Swarm Report</h3>
            {lastSearchReport.agentReports.map((report, index) => {
                const styles = getAgentStyles(report.agentName);
                return (
                    <div key={index} className={`p-4 rounded-lg border-l-4 ${styles.border} ${styles.cardBg}`}>
                        <h4 className="font-semibold text-sm flex items-center">
                           <span className={`font-mono px-2 py-0.5 rounded-md text-xs font-bold text-white ${styles.bg}`}>
                                {report.agentName}
                            </span>
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 italic">"{report.log}"</p>
                        <p className="text-sm font-semibold mt-3 text-slate-800 dark:text-slate-200">Contributed {report.contributedPosts.length} post(s):</p>
                         {report.contributedPosts.length > 0 ? (
                            <ul className="mt-2 space-y-2 text-xs">
                                {report.contributedPosts.map((post, postIndex) => (
                                    <li key={postIndex} className="p-2 bg-white/50 dark:bg-slate-900/50 rounded border border-slate-200 dark:border-slate-700">
                                        <span className="text-slate-700 dark:text-slate-300">{post}</span>
                                    </li>
                                ))}
                            </ul>
                         ) : (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">No posts were contributed by this agent.</p>
                         )}
                    </div>
                );
            })}
            {lastSearchReport.triggerSuggestions && lastSearchReport.triggerSuggestions.length > 0 && (
              <div className="p-3">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">Orchestrator's Trigger Suggestions:</span>
                    <button onClick={handleCopySuggestions} className="text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-900/50 hover:bg-rose-200 dark:hover:bg-rose-900 px-2 py-1 rounded-md transition-colors">
                      {copyButtonText}
                    </button>
                  </div>
                   <div className="mt-2 text-slate-800 dark:text-slate-200 text-xs space-y-1">
                      {lastSearchReport.triggerSuggestions.map((suggestion, index) => (
                        <p key={index} className="font-mono p-2 bg-yellow-50 dark:bg-yellow-900/30 border-l-2 border-yellow-400">{suggestion}</p>
                      ))}
                  </div>
                   <p className="text-xs text-slate-500 mt-1">The agent suggests adding these to <code>unified_triggers.json</code> to improve future autonomous searches.</p>
              </div>
            )}
        </div>
      )}
    </section>
  );
};

export default CuratorView;
