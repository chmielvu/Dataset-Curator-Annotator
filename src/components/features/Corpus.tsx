import React, { useState, useEffect } from 'react';
import { useEmbedding } from '../../hooks/useEmbedding';
import { db } from '../../lib/db';
import { Upload, FileText, Trash, Database } from 'lucide-react';
import { toast } from 'sonner';

export default function Corpus() {
  const { isReady, status, processFile } = useEmbedding();
  const [files, setFiles] = useState<string[]>([]);

  const refreshFiles = async () => {
    const all = await db.chunks.toArray();
    const sources = Array.from(new Set(all.map(c => c.source)));
    setFiles(sources);
  };

  useEffect(() => { refreshFiles(); }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      await processFile(file.name, text);
      toast.success("Document embedded successfully");
      refreshFiles();
    } catch (err: any) {
      toast.error(`Failed: ${err.message}`);
    }
  };

  const deleteFile = async (source: string) => {
    await db.chunks.where('source').equals(source).delete();
    refreshFiles();
    toast.success("Deleted");
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">RAG Corpus</h2>
          <p className="text-muted-foreground">Local Vector Database (Transformers.js)</p>
        </div>
        <div className="flex items-center gap-2">
          {status && (
            <span className="text-sm font-mono text-blue-500 animate-pulse">
              {status.msg}
            </span>
          )}
          <label className={`cursor-pointer flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90 transition-all ${!isReady ? 'opacity-50 pointer-events-none' : ''}`}>
            <Upload className="w-4 h-4" />
            Upload Document
            <input type="file" className="hidden" accept=".txt,.md,.json" onChange={handleUpload} disabled={!isReady} />
          </label>
        </div>
      </div>

      {!isReady && (
        <div className="bg-yellow-500/10 border border-yellow-500/50 text-yellow-500 p-4 rounded-md text-sm">
          Loading Embedding Model (MiniLM-L6)... Please wait.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {files.map(f => (
          <div key={f} className="p-4 border rounded-lg bg-card flex items-center justify-between group">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-muted rounded">
                <FileText className="w-5 h-5 text-muted-foreground" />
              </div>
              <span className="font-medium text-sm truncate max-w-[150px]">{f}</span>
            </div>
            <button onClick={() => deleteFile(f)} className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:bg-destructive/10 p-2 rounded">
              <Trash className="w-4 h-4" />
            </button>
          </div>
        ))}
        
        {files.length === 0 && (
          <div className="col-span-full py-12 flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed rounded-lg">
            <Database className="w-12 h-12 mb-4 opacity-20" />
            <p>No documents indexed.</p>
            <p className="text-sm opacity-50">Upload text files to enable RAG features.</p>
          </div>
        )}
      </div>
    </div>
  );
}