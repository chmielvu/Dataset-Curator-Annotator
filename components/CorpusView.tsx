
import React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { ArchiveSummary } from '../types';
import { db } from '../lib/dexie';
import { useEmbedding } from '../hooks/useEmbedding';

const CorpusView: React.FC = () => {
  const [summary, setSummary] = useState<ArchiveSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { isReady, status, processAndEmbedDocument } = useEmbedding();
  const isEmbedding = status !== null;
  
  const refreshSummary = useCallback(async () => {
    setError(null);
    try {
      const s = await db.getArchiveSummary();
      setSummary(s);
    } catch (e) {
      setError('Could not access the document archive. This can happen if IndexedDB is disabled in your browser.');
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
        setError('Failed to delete the document.');
      }
    }
  };

  return (
    <section className="p-6 border border-gray-200 rounded-lg bg-gray-50 space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-800">Corpus Management (RAG)</h2>
        <p className="mt-2 text-gray-600">Upload text documents (`.txt`, `.md`, `.json`) to create a client-side vector database. This corpus can be used by agents for Retrieval-Augmented Generation.</p>
      </div>

      {error && (
        <div className="p-3 bg-red-100 border border-red-300 text-red-800 text-sm rounded-md">
          {error}
        </div>
      )}

      {status && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
          <div className="flex justify-between items-center mb-1">
            <p className="text-blue-800 text-sm truncate font-medium">{status.title}</p>
            <p className="text-blue-600 text-sm flex-shrink-0">{status.progress} / {status.total}</p>
          </div>
          <div className="w-full bg-blue-100 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-blue-500 h-2 rounded-full transition-all duration-300" 
              style={{ width: `${(status.progress / status.total) * 100}%` }}>
            </div>
          </div>
        </div>
      )}

      <div className="p-6 bg-white rounded-lg shadow-sm border">
        <h3 className="text-xl font-semibold mb-4 text-gray-900">Ingest Document</h3>
        <label 
          className={`inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors ${isEmbedding ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <svg className="w-5 h-5 mr-2 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l-3.75 3.75M12 9.75l3.75 3.75M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" />
          </svg>
          <span>Upload & Embed Document</span>
          <input type="file" className="hidden" onChange={onFileSelected} disabled={isEmbedding} accept=".txt,.md,.csv,.json,.jsonl" />
        </label>
        <p className="text-xs text-gray-500 mt-2">Files are chunked, embedded, and stored locally in your browser's database.</p>
      </div>

      <div>
        <h3 className="text-xl font-semibold mb-4 text-gray-900">Archive Summary</h3>
        {summary.length > 0 ? (
          <ul className="space-y-3">
            {summary.map(item => (
              <li key={item.source} className="flex items-center justify-between p-3 bg-white rounded-md border">
                <div>
                  <p className="font-mono text-sm font-semibold text-gray-800 truncate max-w-md" title={item.source}>{item.source}</p>
                  <p className="text-xs text-gray-500">{item.chunkCount} chunk(s) stored</p>
                </div>
                <button onClick={() => handleDelete(item.source)} className="text-xs text-red-600 hover:text-red-800 font-medium px-3 py-1 rounded-md hover:bg-red-100 transition-colors">
                  Delete
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2 13.5V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2v-2.5" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">Corpus is empty</h3>
            <p className="mt-1 text-sm text-gray-500">Upload a document to build your RAG archive.</p>
          </div>
        )}
      </div>
    </section>
  );
};

export default CorpusView;
