
import React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { ArchiveSummary } from '../types';
import { db } from '../lib/dexie';
import { useEmbedding } from '../hooks/useEmbedding';

const CorpusView: React.FC = () => {
  const [summary, setSummary] = useState<ArchiveSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { isReady, status, processAndEmbedDocument, chunkError, retryChunk, skipChunk, initializationError } = useEmbedding();
  const isProcessing = status !== null;
  
  const refreshSummary = useCallback(async () => {
    setError(null);
    try {
      const s = await db.getArchiveSummary();
      setSummary(s);
    } catch (e) {
      setError('Could not access the document archive. This can happen if IndexedDB is disabled, in private browsing mode, or if browser permissions are too strict.');
      setSummary([]);
    }
  }, []);

  useEffect(() => {
    refreshSummary();
  }, [refreshSummary]);

  const onFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const ALLOWED_TEXT_MIME_TYPES = ['text/plain', 'text/markdown', 'text/csv', 'application/json'];
    
    if (ALLOWED_TEXT_MIME_TYPES.includes(file.type) || file.name.endsWith('.md') || file.name.endsWith('.jsonl')) {
      try {
        setError(null);
        const text = await file.text();
        await processAndEmbedDocument(file.name, text);
        refreshSummary();
      } catch (err: any) {
        setError(`Failed to process ${file.name}. Error: ${err.message}`);
      }
    } else {
      setError(`Unsupported file type: "${file.type || 'unknown'}". Please select a .txt, .md, .csv, or .json file.`);
    }
    event.target.value = ''; // Reset file input
  };

  const handleDelete = async (sourceName: string) => {
    if (confirm(`Are you sure you want to delete all chunks from "${sourceName}"?`)) {
      try {
        await db.deleteSource(sourceName);
        refreshSummary();
      } catch (e) {
        setError(`Failed to delete '${sourceName}'. This could be a browser permission issue or a problem with the local database.`);
      }
    }
  };

  return (
    <section className="p-4 sm:p-6 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/50 space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100">Document Archive (RAG)</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Upload text documents (`.txt`, `.md`, `.json`) to create a client-side vector database. This corpus can be used by agents for Retrieval-Augmented Generation.</p>
      </div>

      {initializationError && (
        <div className="p-4 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-500/50 text-yellow-800 dark:text-yellow-300 text-sm rounded-md">
          <h4 className="font-bold">Embedding Service Unavailable</h4>
          <p>{initializationError}</p>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-500/50 text-red-800 dark:text-red-300 text-sm rounded-md">
          {error}
        </div>
      )}

      {chunkError && (
        <div className="p-4 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-500/50 text-red-800 dark:text-red-300 text-sm rounded-md space-y-3 my-4">
          <h4 className="font-bold">Embedding Failed for Chunk {chunkError.chunkIndex + 1} of {chunkError.total}</h4>
          <p className="font-mono text-xs bg-red-50 dark:bg-red-900/50 p-2 rounded border border-red-200 dark:border-red-500/70">
            <strong>Error:</strong> {chunkError.error?.message || 'An unknown error occurred.'}
          </p>
          <div>
            <p className="font-semibold mb-1 text-sm">Chunk Content:</p>
            <blockquote className="text-xs border-l-4 border-red-300 dark:border-red-500 pl-2 max-h-24 overflow-y-auto bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 p-2 rounded">
              {chunkError.chunkText}
            </blockquote>
          </div>
          <div className="flex items-center space-x-2 pt-2">
            <button 
              onClick={retryChunk} 
              className="px-3 py-1 bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-bold rounded-md transition-colors"
            >
              Retry
            </button>
            <button 
              onClick={skipChunk} 
              className="px-3 py-1 bg-slate-500 hover:bg-slate-600 text-white text-xs font-bold rounded-md transition-colors"
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {status && !chunkError && (
        <div className="p-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-500/50 rounded-md">
          <div className="flex justify-between items-center mb-1">
            <p className="text-blue-800 dark:text-blue-300 text-sm truncate font-medium">{status.title}</p>
            <p className="text-blue-600 dark:text-blue-400 text-sm flex-shrink-0">{status.progress} / {status.total}</p>
          </div>
          <div className="w-full bg-blue-100 dark:bg-blue-900/50 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-blue-500 h-2 rounded-full transition-all duration-300" 
              style={{ width: `${(status.progress / status.total) * 100}%` }}>
            </div>
          </div>
        </div>
      )}

      <div className="p-6 bg-white dark:bg-slate-700/50 rounded-lg shadow-sm border dark:border-slate-600">
        <h3 className="text-xl font-semibold mb-4 text-slate-900 dark:text-slate-100">Ingest Document</h3>
        <label 
          className={`inline-flex items-center px-4 py-2 border border-slate-300 dark:border-slate-500 shadow-sm text-sm font-medium rounded-md text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-600 hover:bg-slate-50 dark:hover:bg-slate-500 transition-colors ${isProcessing || !isReady ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <svg className="w-5 h-5 mr-2 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l-3.75 3.75M12 9.75l3.75 3.75M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" />
          </svg>
          <span>Upload & Embed Document</span>
          <input type="file" className="hidden" onChange={onFileSelected} disabled={isProcessing || !isReady} accept=".txt,.md,.csv,.json,.jsonl" />
        </label>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Files are chunked, embedded, and stored locally in your browser's database.</p>
      </div>

      <div>
        <h3 className="text-xl font-semibold mb-4 text-slate-900 dark:text-slate-100">Archive Summary</h3>
        {summary.length > 0 ? (
          <ul className="space-y-3">
            {summary.map(item => (
              <li key={item.source} className="flex items-center justify-between p-3 bg-white dark:bg-slate-700/50 rounded-md border dark:border-slate-600">
                <div>
                  <p className="font-mono text-sm font-semibold text-slate-800 dark:text-slate-200 truncate max-w-md" title={item.source}>{item.source}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{item.chunkCount} chunk(s) stored</p>
                </div>
                <button onClick={() => handleDelete(item.source)} className="text-xs text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 font-medium px-3 py-1 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors">
                  Delete
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-12 text-center">
            <svg className="mx-auto h-12 w-12 text-slate-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2 13.5V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2v-2.5" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-200">Corpus is empty</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Upload a document to build your RAG archive.</p>
          </div>
        )}
      </div>
    </section>
  );
};

export default CorpusView;
