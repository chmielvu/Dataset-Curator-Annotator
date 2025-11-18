import React from 'react';
import { useState, useRef } from 'react';
import { DatasetState, SwarmJobResult, SpecialistAgentResult, Annotation, CurationJob, FeedbackLogEntry } from '../types';
import { useEmbedding } from '../hooks/useEmbedding';
import { db } from '../lib/dexie';
import SwarmVisualizer from './SwarmVisualizer';
import { getTacticId, getCleavageId } from '../utils/codex';
import { CLEAVAGE_IDS } from '../utils/constants';


interface CuratorViewProps {
  datasetState: DatasetState;
  onQueueUpdate: () => void;
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

const generateDynamicTasks = (datasetState: DatasetState, manualQueries: string, apoFeedback: FeedbackLogEntry[]): { name: string; persona: string; task: string }[] => {
    // 1. Analyze APO feedback by diffing annotations to find common agent errors
    const feedbackAnalysis = {
        underratedCleavages: {} as Record<string, number>,
        missedTactics: {} as Record<string, number>,
    };

    apoFeedback.forEach(entry => {
        // Find missed tactics (present in corrected annotation but not original)
        const originalTactics = new Set(entry.originalAnnotation.tactics || []);
        const correctedTactics = new Set(entry.correctedAnnotation.tactics || []);
        correctedTactics.forEach(tacticName => {
            if (!originalTactics.has(tacticName)) {
                const tacticId = getTacticId(tacticName);
                if (tacticId) {
                    feedbackAnalysis.missedTactics[tacticId] = (feedbackAnalysis.missedTactics[tacticId] || 0) + 1;
                }
            }
        });

        // Find underrated cleavages (score significantly increased by human)
        const originalLabels = entry.originalAnnotation.labels || [];
        const correctedLabels = entry.correctedAnnotation.labels || [];
        originalLabels.forEach((originalScore, index) => {
            if (correctedLabels.length > index && correctedLabels[index] > originalScore + 0.2) { // Threshold for a significant increase
                const cleavageId = CLEAVAGE_IDS[index];
                if (cleavageId) {
                    feedbackAnalysis.underratedCleavages[cleavageId] = (feedbackAnalysis.underratedCleavages[cleavageId] || 0) + 1;
                }
            }
        });
    });

    const getMostCommonError = (errorMap: Record<string, number>): string | null => {
        if (Object.keys(errorMap).length === 0) return null;
        return Object.entries(errorMap).sort(([,a], [,b]) => b - a)[0][0];
    };

    const mostUnderratedCleavage = getMostCommonError(feedbackAnalysis.underratedCleavages);
    const mostMissedTactic = getMostCommonError(feedbackAnalysis.missedTactics);

    // 2. Perform original gap analysis from dataset state
    const findUnderrepresented = (data: { [key: string]: number }): string[] => {
      if (!data || Object.keys(data).length === 0) return [];
      return Object.entries(data)
        .sort(([, a], [, b]) => a - b)
        .map(([key]) => key);
    };
  
    const cleavagesSorted = findUnderrepresented(datasetState.cleavages);
    const tacticsSorted = findUnderrepresented(datasetState.tactics);
    const emotionsSorted = findUnderrepresented(datasetState.emotions);
  
    const leastRepCleavage = cleavagesSorted[0] || 'cleavage_post_peasant';
    const secondLeastCleavage = cleavagesSorted[1] || 'cleavage_economic_anxiety';
    const mostRepCleavage = cleavagesSorted[cleavagesSorted.length - 1] || 'cleavage_sovereigntist';
    const leastRepTactic = tacticsSorted[0] || 'tactic_loaded_language';
    const leastRepEmotion = emotionsSorted[0] || 'emotion_solidarity';

    // 3. Dynamically adjust tasks based on combined feedback and gap analysis
    let balancerTask: string;
    if (mostUnderratedCleavage) {
        balancerTask = `APO feedback shows agents consistently underrate '${mostUnderratedCleavage}'. Find clear, unambiguous examples of this to help recalibrate. Also consider the dataset's least represented cleavage: '${leastRepCleavage}'.`;
    } else {
        balancerTask = `Our dataset is low on '${leastRepCleavage}'. Find posts that clearly exemplify this.`;
    }

    let explorerTask: string;
    if (mostMissedTactic) {
        explorerTask = `APO feedback shows agents often miss the '${mostMissedTactic}' tactic. Explore its use, especially in combination with the '${secondLeastCleavage}' cleavage.`;
    } else {
        explorerTask = `Explore the intersection of the '${secondLeastCleavage}' cleavage and the least-common '${leastRepTactic}' tactic.`;
    }
    
    const wildcardTask = `The dataset is saturated with '${mostRepCleavage}'. Find a surprising or nuanced post about this topic that also evokes the underrepresented emotion of '${leastRepEmotion}'.`;
  
    // 4. Construct final task list
    if (manualQueries.trim()) {
      return [
        { name: "Manual", persona: "User Proxy", task: `Fulfill this high-priority manual query. Use RAG context if provided. Query: "${manualQueries.trim()}"` },
        { name: "Balancer", persona: "Data-Gap Analyst", task: balancerTask },
        { name: "Explorer", persona: "Creative Strategist", task: explorerTask }
      ];
    } else {
      return [
        { name: "Balancer", persona: "Data-Gap Analyst", task: balancerTask },
        { name: "Explorer", persona: "Creative Strategist", task: explorerTask },
        { name: "Wildcard", persona: "OSINT Expert", task: wildcardTask }
      ];
    }
};


const CuratorView: React.FC<CuratorViewProps> = ({ datasetState, onQueueUpdate, onError }) => {
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
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

  const [batchesToRun, setBatchesToRun] = useState(5);
  const [job, setJob] = useState<CurationJob | null>(null);
  const cancelJobRef = useRef(false);

  const { isReady: isEmbeddingReady, isLoading: isEmbeddingLoading, generateEmbedding, initializationError } = useEmbedding();
  
  const isProcessingFile = batchStatus !== null;
  const isJobActive = job?.isActive ?? false;

  const handleManualSubmit = async () => {
    if (manualPost.trim()) {
      const addedCount = await db.addPostsToQueue([manualPost.trim()]);
      onQueueUpdate();
      setManualPost('');
    }
  };

  const handleBatchUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
  
    if (!file.name.endsWith('.jsonl')) {
        onError("Invalid file type. Please select a .jsonl file (JSON Lines).");
        event.target.value = '';
        return;
    }
  
    onError(null);
    
    try {
        const text = await file.text();
        const lines = text.split('\n').filter(line => line.trim() !== '');
        const totalLines = lines.length;
        
        if (totalLines === 0) throw new Error("File is empty or contains no valid lines.");

        setBatchStatus({ fileName: file.name, total: totalLines, processed: 0, found: 0, errors: 0 });
    
        const posts: string[] = [];
        for (let i = 0; i < totalLines; i++) {
          try {
            const annotation = JSON.parse(lines[i]) as Partial<Annotation>;
            if (annotation.text && typeof annotation.text === 'string' && annotation.text.trim()) posts.push(annotation.text.trim());
          } catch (e) { /* ignore parse errors */ }
        }
    
        if (posts.length === 0) {
            onError(`No valid posts with a 'text' field were found in ${file.name}.`);
        } else {
            const addedCount = await db.addPostsToQueue(posts);
            onQueueUpdate();
        }
    } catch (e: any) {
        onError(`Failed to read file: ${e.message}`);
    } finally {
        setBatchStatus(null);
        if (event.target) event.target.value = '';
    }
  };
  
  const handleCancelJob = () => {
    cancelJobRef.current = true;
  };

  const handleRunAgent = async () => {
    onError(null);
    setShowReport(false);
    setLastSearchReport(null);
    cancelJobRef.current = false;
    let jobError: string | null = null;
    
    setJob({
      isActive: true,
      isCancelled: false,
      batchesRequested: batchesToRun,
      batchesCompleted: 0,
      postsFound: 0,
    });
    
    let totalPostsFoundThisJob = 0;
    
    for (let i = 0; i < batchesToRun; i++) {
        if (cancelJobRef.current) {
            setJob(prev => prev ? { ...prev, isCancelled: true, isActive: false } : null);
            break;
        }

        setJob(prev => prev ? { ...prev, batchesCompleted: i } : prev);
        setStatusMessage(`Analyzing dataset for batch ${i + 1}...`);
        setLastSearchReport(null); // Clear previous report for visualizer

        let recentFeedback: FeedbackLogEntry[] = [];
        try {
          recentFeedback = await db.getRecentFeedback(5);
        } catch (err) { console.warn("Could not fetch APO feedback:", err); }

        const tasks = generateDynamicTasks(datasetState, manualQueries, recentFeedback);
        const bodyPayload: any = { apoFeedback: recentFeedback, precomputedTasks: tasks };
        
        if (manualQueries.trim()) {
            bodyPayload.manualQueries = manualQueries.trim();
            if (isEmbeddingReady && generateEmbedding) {
                try {
                    setStatusMessage(`Performing RAG search for batch ${i + 1}...`);
                    const queryEmbedding = await generateEmbedding(manualQueries.trim());
                    const searchResults = await db.findSimilar(queryEmbedding, 3);
                    if (searchResults.length > 0) bodyPayload.ragContext = searchResults.map((r, idx) => `[Reference ${idx+1}]: "${r.text}"`).join('\n');
                } catch (ragErr) { console.warn("RAG search failed, proceeding without it.", ragErr); }
            }
        }

        try {
            setStatusMessage(`Engaging curator swarm for batch ${i + 1}/${batchesToRun}...`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 90000); // 90-second timeout

            const response = await fetch('/api/curator-swarm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyPayload),
                signal: controller.signal,
            });
            
            clearTimeout(timeoutId);

            if (!response.ok) {
                let errorMsg = `Swarm execution failed with status: ${response.status}.`;
                if (response.status === 429) {
                    errorMsg = "API rate limit reached. Please wait a minute before starting a new job.";
                } else if (response.status === 504) {
                    errorMsg = "The agent swarm timed out on the server. This can happen with complex queries. Please try again.";
                } else {
                    try {
                        const errorData = await response.json();
                        errorMsg = errorData.details || errorMsg;
                    } catch (e) { /* no json body */ }
                }
                throw new Error(errorMsg);
            }
            
            const data = await response.json();
            const swarmResult = data.swarmResult as SwarmJobResult;

            if (!swarmResult) throw new Error("Agent swarm returned a malformed response.");
            
            
            if (swarmResult.finalPosts && swarmResult.finalPosts.length > 0) {
              const addedCount = await db.addPostsToQueue(swarmResult.finalPosts);
              totalPostsFoundThisJob += addedCount;
              onQueueUpdate();
            }

            setJob(prev => prev ? { ...prev, batchesCompleted: i + 1, postsFound: totalPostsFoundThisJob } : null);
            
            // Set report for visualizer AFTER updating job state to ensure animation triggers correctly
            setLastSearchReport(swarmResult); 
            
            // Wait for animation to finish before next batch
            if (!cancelJobRef.current && i < batchesToRun - 1) {
              setStatusMessage(`Batch ${i+1} complete. Waiting before next cycle...`);
              await new Promise(resolve => setTimeout(resolve, 3000));
            }


        } catch (err: any) {
            console.error('CuratorView Swarm Error:', err);
            let errorMessage;
            if (err.name === 'AbortError') {
                errorMessage = `Curator Swarm Timed Out: The request took longer than 90 seconds and was cancelled.`;
            } else {
                errorMessage = `Curator Swarm Failed on batch ${i+1}: ${err.message}`;
            }
            
            jobError = errorMessage;
            onError(errorMessage);
            setStatusMessage(errorMessage);
            setJob(prev => prev ? { ...prev, isActive: false } : null);
            break; 
        }
    }
    
    if (!jobError) {
      const finalMessage = cancelJobRef.current ? 'Curation job cancelled.' : 'Curation job complete.';
      setStatusMessage(finalMessage);
    }
    setJob(prev => prev ? { ...prev, isActive: false } : null);
  };
  
  const handleCopySuggestions = () => {
    if (lastSearchReport?.triggerSuggestions) {
      const textToCopy = lastSearchReport.triggerSuggestions.join('\n');
      navigator.clipboard.writeText(textToCopy).then(() => {
        setCopyButtonText('Copied!');
        setTimeout(() => setCopyButtonText('Copy Suggestions'), 2000);
      });
    }
  };
  
  const RagStatusIndicator = () => {
    let statusColor, statusText, pulse;
    if (isEmbeddingLoading) [statusColor, statusText, pulse] = ['text-yellow-600 dark:text-yellow-400', 'RAG Initializing...', true];
    else if (initializationError) [statusColor, statusText, pulse] = ['text-red-600 dark:text-red-400', 'RAG Failed', false];
    else if (isEmbeddingReady) [statusColor, statusText, pulse] = ['text-green-600 dark:text-green-400', 'RAG Ready', false];
    else [statusColor, statusText, pulse] = ['text-slate-500 dark:text-slate-400', 'RAG Unavailable', false];

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
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Launch an asynchronous job to find and queue new posts for annotation.</p>
      
      <div className="my-6 space-y-4 bg-white dark:bg-slate-900/30 p-4 rounded-lg border dark:border-slate-700/50">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-center">
            <div className="flex items-center gap-2">
                <label htmlFor="batch-count" className="text-sm font-medium text-slate-700 dark:text-slate-300 flex-shrink-0">Batches (of 10):</label>
                <input
                  type="number" id="batch-count" min="1" max="50"
                  value={batchesToRun}
                  onChange={(e) => setBatchesToRun(parseInt(e.target.value, 10))}
                  disabled={isJobActive}
                  className="w-full p-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:ring-rose-500 focus:border-rose-500 transition disabled:bg-slate-200 dark:disabled:bg-slate-700 bg-white dark:bg-slate-800"
                />
            </div>
            <div className="lg:col-span-2 flex items-center gap-2">
               {isJobActive ? (
                  <button onClick={handleCancelJob} className="w-full px-4 py-3 text-white bg-slate-600 rounded-md hover:bg-slate-700 font-semibold text-base shadow-lg">
                      Stop Curation Job
                  </button>
               ) : (
                <button onClick={handleRunAgent} disabled={isJobActive || isProcessingFile} className="w-full px-4 py-3 text-white bg-rose-600 rounded-md hover:bg-rose-700 disabled:bg-rose-400 dark:disabled:bg-rose-800 disabled:cursor-not-allowed transition-all duration-200 ease-in-out flex items-center justify-center font-semibold text-base shadow-lg shadow-rose-500/10 hover:shadow-xl hover:shadow-rose-500/20">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    Start Asynchronous Curation
                </button>
               )}
            </div>
        </div>
        {job && (
            <div className="mt-4 p-3 bg-slate-100 dark:bg-slate-900/50 rounded-lg border dark:border-slate-700/50 space-y-2">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 whitespace-pre-wrap">{statusMessage}</p>
                 <div className="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full">
                    <div 
                      className="bg-rose-600 h-2.5 rounded-full transition-all duration-200" 
                      style={{ width: job.batchesRequested > 0 ? `${(job.batchesCompleted / job.batchesRequested) * 100}%` : '0%' }}>
                    </div>
                </div>
                <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>Batches: {job.batchesCompleted} / {job.batchesRequested}</span>
                    <span>New Posts Queued: {job.postsFound}</span>
                </div>
            </div>
        )}
      </div>

      <SwarmVisualizer job={job} report={lastSearchReport} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <div className="bg-white dark:bg-slate-900/30 p-4 rounded-lg border dark:border-slate-700/50">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-200">Manual Search Queries <span className="text-sm font-normal text-slate-500">(RAG-Augmented)</span></h3>
            <RagStatusIndicator />
          </div>
          <textarea
            value={manualQueries}
            onChange={(e) => setManualQueries(e.target.value)}
            placeholder="e.g., 'Discuss the impact of Zielony Ład on small farms.'"
            className="w-full p-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:ring-rose-500 focus:border-rose-500 transition disabled:bg-slate-200 dark:disabled:bg-slate-700 bg-white dark:bg-slate-800"
            rows={2}
            disabled={isJobActive || isProcessingFile}
          />
           <p className="text-xs text-slate-500 mt-1">The agent swarm will use this for RAG-augmented search.</p>
        </div>
         <div className="bg-white dark:bg-slate-900/30 p-4 rounded-lg border dark:border-slate-700/50 space-y-4">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-200 mb-2">Manual Entry <span className="text-sm font-normal text-slate-500">(Add to Queue)</span></h3>
          
          <div className="space-y-2">
            <div className="flex items-start space-x-2">
              <textarea
                value={manualPost}
                onChange={(e) => setManualPost(e.target.value)}
                placeholder="Paste text here to send it directly to the annotation queue."
                className="w-full p-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:ring-rose-500 focus:border-rose-500 transition disabled:bg-slate-200 dark:disabled:bg-slate-700 bg-white dark:bg-slate-800"
                rows={2}
                disabled={isJobActive || isProcessingFile}
              />
              <button 
                onClick={handleManualSubmit} 
                disabled={!manualPost.trim() || isJobActive || isProcessingFile}
                className="px-4 py-2 text-sm font-semibold text-white bg-rose-600 rounded-md hover:bg-rose-700 disabled:bg-rose-400 dark:disabled:bg-rose-800"
              >
                Queue
              </button>
            </div>
          </div>
          
           <div className="relative"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-300 dark:border-slate-600"></div></div><div className="relative flex justify-center"><span className="bg-white dark:bg-slate-900/30 px-2 text-sm text-slate-500">Or</span></div></div>

          <div className="space-y-2">
             <label className={`inline-flex items-center px-4 py-2 border border-slate-300 dark:border-slate-500 shadow-sm text-sm font-medium rounded-md text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-600 hover:bg-slate-50 dark:hover:bg-slate-500 transition-colors ${isJobActive || isProcessingFile ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                <span>Upload .jsonl Batch</span>
                <input type="file" className="hidden" onChange={handleBatchUpload} disabled={isJobActive || isProcessingFile} accept=".jsonl" />
            </label>
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
                        <h4 className="font-semibold text-sm flex items-center"><span className={`font-mono px-2 py-0.5 rounded-md text-xs font-bold text-white ${styles.bg}`}>{report.agentName}</span></h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 italic">"{report.log}"</p>
                        <p className="text-sm font-semibold mt-3 text-slate-800 dark:text-slate-200">Contributed {report.contributedPosts.length} post(s):</p>
                         {report.contributedPosts.length > 0 ? (
                            <ul className="mt-2 space-y-2 text-xs">{report.contributedPosts.map((post, postIndex) => (<li key={postIndex} className="p-2 bg-white/50 dark:bg-slate-900/50 rounded border border-slate-200 dark:border-slate-700"><span className="text-slate-700 dark:text-slate-300">{post}</span></li>))}</ul>
                         ) : (<p className="text-xs text-slate-500 dark:text-slate-400 mt-1">No posts were contributed by this agent.</p>)}
                    </div>
                );
            })}
            {lastSearchReport.triggerSuggestions && lastSearchReport.triggerSuggestions.length > 0 && (
              <div className="p-3">
                  <div className="flex justify-between items-center"><span className="font-semibold text-sm text-slate-800 dark:text-slate-100">Orchestrator's Trigger Suggestions:</span><button onClick={handleCopySuggestions} className="text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-900/50 hover:bg-rose-200 dark:hover:bg-rose-900 px-2 py-1 rounded-md transition-colors">{copyButtonText}</button></div>
                   <div className="mt-2 text-slate-800 dark:text-slate-200 text-xs space-y-1">{lastSearchReport.triggerSuggestions.map((suggestion, index) => (<p key={index} className="font-mono p-2 bg-yellow-50 dark:bg-yellow-900/30 border-l-2 border-yellow-400">{suggestion}</p>))}</div>
                   <p className="text-xs text-slate-500 mt-1">The agent suggests adding these to <code>unified_triggers.json</code> to improve future autonomous searches.</p>
              </div>
            )}
        </div>
      )}
    </section>
  );
};

export default CuratorView;