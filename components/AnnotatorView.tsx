import React from 'react';
import { useState, useRef, useEffect } from 'react';
import { Annotation } from '../types';
import { db } from '../lib/dexie';

interface AnnotatorViewProps {
  curationQueueCount: number;
  onQueuesUpdate: () => void;
  onError: (error: string | null) => void;
}

// Helper for a robust API call with timeout and specific error handling
async function callAnnotatorApi(postToAnnotate: string): Promise<Annotation> {
    const controller = new AbortController();
    // 60-second timeout for each annotation request
    const timeoutId = setTimeout(() => controller.abort(), 60000); 

    try {
        const recentFeedback = await db.getRecentFeedback(5);
        const response = await fetch('/api/annotator', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ post: postToAnnotate, apoFeedback: recentFeedback }),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            let errorMsg = `Agent failed with status ${response.status}.`;
            if (response.status === 429) {
                errorMsg = "Rate limit reached";
            } else if (response.status === 504) {
                errorMsg = "Server timeout";
            } else {
                try {
                    const errorData = await response.json();
                    errorMsg = errorData.details || errorMsg;
                } catch (e) { /* ignore if no json body */ }
            }
            throw new Error(errorMsg);
        }
        
        const data = await response.json();
        if (!data.annotation) {
            throw new Error("Malformed response from agent.");
        }
        return data.annotation;

    } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
            throw new Error("Client timeout (60s).");
        }
        throw err;
    }
}


const AnnotatorView: React.FC<AnnotatorViewProps> = ({ curationQueueCount, onQueuesUpdate, onError }) => {
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ processed: 0, total: 0, errors: 0 });
  const [manualPostText, setManualPostText] = useState('');
  const [activityLog, setActivityLog] = useState<string[]>([]);
  const logContainerRef = useRef<HTMLDivElement>(null);
  
  const cancelBatchRef = useRef(false);

  useEffect(() => {
    if (logContainerRef.current) {
        logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [activityLog]);

  const handleManualAnnotation = async () => {
    if (!manualPostText.trim()) return;
    setIsBatchRunning(true);
    onError(null);
    try {
        const annotation = await callAnnotatorApi(manualPostText.trim());
        await db.addForVerification(manualPostText.trim(), annotation);
        onQueuesUpdate();
        setManualPostText('');
    } catch (err: any) {
        onError(`Manual annotation failed: ${err.message}`);
    } finally {
        setIsBatchRunning(false);
    }
  };
  
  const handleRunBatchAnnotation = async () => {
    cancelBatchRef.current = false;
    setIsBatchRunning(true);
    onError(null);
    const totalToProcess = curationQueueCount;
    setBatchProgress({ processed: 0, total: totalToProcess, errors: 0 });
    setActivityLog([`[${new Date().toLocaleTimeString()}] Starting batch for ${totalToProcess} posts.`]);

    for (let i = 0; i < totalToProcess; i++) {
      if (cancelBatchRef.current) {
        setActivityLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] Batch cancelled by user.`]);
        break;
      }
      
      const postToAnnotate = await db.dequeuePost();
      if (!postToAnnotate) {
        setActivityLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] Queue is empty. Stopping batch.`]);
        break;
      }

      const logId = activityLog.length + i;
      setActivityLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] [${i+1}/${totalToProcess}] Annotating: "${postToAnnotate.substring(0, 40)}..."`]);

      try {
        const annotation = await callAnnotatorApi(postToAnnotate);
        await db.addForVerification(postToAnnotate, annotation);
        setBatchProgress(p => ({ ...p, processed: p.processed + 1 }));
        setActivityLog(prev => prev.map((log, index) => index === logId ? `${log} -> ✔️ Success` : log));

      } catch (err: any) {
        console.error("Error during batch annotation:", err);
        // Put the failed post back in the queue for another try later
        await db.addPostsToQueue([postToAnnotate]);
        setBatchProgress(p => ({ ...p, errors: p.errors + 1 }));
        const errorMessage = err.message || "Unknown error";
        setActivityLog(prev => prev.map((log, index) => index === logId ? `${log} -> ❌ FAILED (${errorMessage}) - Re-queued` : log));

        // Special handling for rate limits - pause the whole batch
        if (errorMessage.includes("Rate limit")) {
            setActivityLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] Rate limit hit. Pausing batch for 5 seconds...`]);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
      } finally {
        // Update counts after every item
        onQueuesUpdate();
      }
    }
    
    setActivityLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] Batch finished.`]);
    setIsBatchRunning(false);
  };
  
  const handleCancelBatch = () => {
    cancelBatchRef.current = true;
  };
  
  const hasWorkToDo = curationQueueCount > 0;

  return (
    <section className="p-4 sm:p-6 border border-rose-200 dark:border-rose-500/30 rounded-lg bg-rose-50 dark:bg-rose-900/20 relative">
      <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100">2. Annotator Agent</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Run a batch job to automatically annotate all posts in the queue, or enter a single post manually.</p>
      
       <div className="my-6 p-4 bg-white dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600/50 rounded-lg shadow-sm">
        <h3 className="text-lg font-medium text-slate-900 dark:text-slate-200">Batch Annotation</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {hasWorkToDo ? `${curationQueueCount} posts are ready for annotation.` : `The annotation queue is empty.`}
        </p>

        {isBatchRunning && (
             <div className="mt-4 p-3 bg-slate-100 dark:bg-slate-900/50 rounded-lg border dark:border-slate-700/50 space-y-2">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {cancelBatchRef.current ? 'Cancelling batch...' : 'Annotating...'}
                </p>
                 <div className="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full">
                    <div 
                      className="bg-rose-600 h-2.5 rounded-full transition-all duration-200" 
                      style={{ width: batchProgress.total > 0 ? `${(batchProgress.processed / batchProgress.total) * 100}%` : '0%' }}>
                    </div>
                </div>
                <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>Processed: {batchProgress.processed} / {batchProgress.total}</span>
                    <span>Errors: {batchProgress.errors}</span>
                </div>
                <div ref={logContainerRef} className="mt-2 p-2 bg-slate-200 dark:bg-slate-800 rounded-md h-32 overflow-y-auto font-mono text-xs text-slate-600 dark:text-slate-400 space-y-1">
                    {activityLog.map((log, index) => <p key={index} className="whitespace-pre-wrap leading-relaxed">{log}</p>)}
                </div>
            </div>
        )}

        <div className="mt-4">
            {isBatchRunning ? (
                <button 
                    onClick={handleCancelBatch}
                    className="w-full px-4 py-3 font-semibold text-white bg-slate-600 rounded-md hover:bg-slate-700"
                >
                    Stop Batch Job
                </button>
            ) : (
                <button 
                    onClick={handleRunBatchAnnotation} 
                    disabled={!hasWorkToDo}
                    className="w-full px-4 py-3 font-semibold text-white bg-rose-600 rounded-md hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-rose-500 disabled:bg-rose-400 dark:disabled:bg-rose-800 disabled:cursor-not-allowed transition-all duration-200 ease-in-out flex items-center justify-center shadow-lg shadow-rose-500/10 hover:shadow-xl hover:shadow-rose-500/20"
                >
                    Start Batch Annotation ({curationQueueCount})
                </button>
            )}
        </div>
      </div>

       <div className="my-6 p-4 bg-white dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600/50 rounded-lg shadow-sm">
         <h3 className="text-lg font-medium text-slate-900 dark:text-slate-200">Manual Annotation</h3>
         <textarea
            value={manualPostText}
            onChange={(e) => setManualPostText(e.target.value)}
            placeholder="Paste text here to annotate a single post and send it to verification."
            className="mt-2 w-full p-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:ring-rose-500 focus:border-rose-500 transition bg-white dark:bg-slate-800"
            rows={4}
            disabled={isBatchRunning}
          />
          <button 
            onClick={handleManualAnnotation} 
            disabled={isBatchRunning || !manualPostText.trim()}
            className="mt-2 w-full sm:w-auto px-4 py-2 font-semibold text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:bg-indigo-400 dark:disabled:bg-indigo-800 disabled:cursor-not-allowed transition-colors"
          >
            Annotate &amp; Send to Verifier
          </button>
       </div>
    </section>
  );
};

export default AnnotatorView;