import React, { useState, useEffect, useCallback, ChangeEvent, FC } from 'react';
import { ArchiveSummary } from '../types';
import { db } from '../lib/dexie';
import { useEmbedding } from '../hooks/useEmbedding';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { toast } from './ui/sonner';
import { Upload, Archive, FileText, AlertTriangle, X } from 'lucide-react';

const CorpusView: FC = () => {
  const [summary, setSummary] = useState<ArchiveSummary[]>([]);
  const { isReady, status, processAndEmbedDocument, chunkError, retryChunk, skipChunk, initializationError } = useEmbedding();
  const isProcessing = status !== null;
  
  const refreshSummary = useCallback(async () => {
    try {
      const s = await db.getArchiveSummary();
      setSummary(s);
    } catch (e: any) {
      toast.error('Could not access the document archive.', { description: e.message });
      setSummary([]);
    }
  }, []);

  useEffect(() => {
    refreshSummary();
  }, [refreshSummary]);

  const onFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const ALLOWED_TEXT_MIME_TYPES = ['text/plain', 'text/markdown', 'text/csv', 'application/json'];
    
    if (ALLOWED_TEXT_MIME_TYPES.includes(file.type) || file.name.endsWith('.md') || file.name.endsWith('.jsonl')) {
      try {
        const text = await file.text();
        await processAndEmbedDocument(file.name, text);
        refreshSummary();
      } catch (err: any) {
        toast.error(`Failed to process ${file.name}.`, { description: err.message });
      }
    } else {
      toast.error(`Unsupported file type`, { description: `"${file.type || 'unknown'}". Please select a .txt, .md, .csv, or .json file.` });
    }
    event.target.value = ''; // Reset file input
  };

  const handleDelete = async (sourceName: string) => {
    if (confirm(`Are you sure you want to delete all chunks from "${sourceName}"?`)) {
      try {
        await db.deleteSource(sourceName);
        refreshSummary();
        toast.success(`Deleted "${sourceName}" from the archive.`);
      } catch (e: any) {
        toast.error(`Failed to delete '${sourceName}'.`, { description: e.message });
      }
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Document Archive (RAG)</CardTitle>
        <CardDescription>Upload text documents to create a client-side vector database for Retrieval-Augmented Generation.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {initializationError && (
          <div className="p-4 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-500/50 text-yellow-800 dark:text-yellow-300 text-sm rounded-md">
            <h4 className="font-bold">Embedding Service Unavailable</h4>
            <p>{initializationError}</p>
          </div>
        )}

        {chunkError && (
          <Card className="p-4 bg-destructive/10 border-destructive">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive"><AlertTriangle size={20} /> Embedding Failed</CardTitle>
              <CardDescription className="text-destructive/80">Chunk {chunkError.chunkIndex + 1} of {chunkError.total} failed.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-xs bg-destructive/10 p-2 rounded border border-destructive/20">
                <strong>Error:</strong> {chunkError.error?.message || 'An unknown error occurred.'}
              </p>
              <div className="mt-2">
                <p className="font-semibold mb-1 text-sm">Chunk Content:</p>
                <blockquote className="text-xs border-l-4 border-destructive pl-2 max-h-24 overflow-y-auto bg-background p-2 rounded">
                  {chunkError.chunkText}
                </blockquote>
              </div>
              <div className="flex items-center space-x-2 pt-4">
                <Button onClick={retryChunk} variant="secondary">Retry</Button>
                <Button onClick={skipChunk} variant="ghost">Skip</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {status && !chunkError && (
          <div className="p-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-500/50 rounded-md">
            <div className="flex justify-between items-center mb-1">
              <p className="text-blue-800 dark:text-blue-300 text-sm truncate font-medium">{status.title}</p>
              <p className="text-blue-600 dark:text-blue-400 text-sm flex-shrink-0">{status.progress} / {status.total}</p>
            </div>
            <Progress value={(status.progress / status.total) * 100} />
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Ingest Document</CardTitle>
          </CardHeader>
          <CardContent>
            <label>
              <Button asChild variant="outline" disabled={isProcessing || !isReady}>
                <div>
                  <Upload className="w-4 h-4 mr-2" />
                  <span>Upload & Embed Document</span>
                </div>
              </Button>
              <input type="file" className="hidden" onChange={onFileSelected} disabled={isProcessing || !isReady} accept=".txt,.md,.csv,.json,.jsonl" />
            </label>
            <p className="text-xs text-muted-foreground mt-2">Files are chunked, embedded, and stored locally in your browser.</p>
          </CardContent>
        </Card>

        <div>
          <h3 className="text-xl font-semibold mb-4">Archive Summary</h3>
          {summary.length > 0 ? (
            <ul className="space-y-3">
              {summary.map(item => (
                <li key={item.source} className="flex items-center justify-between p-3 bg-background rounded-md border">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="font-mono text-sm font-semibold truncate max-w-md" title={item.source}>{item.source}</p>
                      <p className="text-xs text-muted-foreground">{item.chunkCount} chunk(s) stored</p>
                    </div>
                  </div>
                  <Button onClick={() => handleDelete(item.source)} variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                    <X className="w-4 h-4 mr-1" /> Delete
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="border-2 border-dashed rounded-lg p-12 text-center">
              <Archive className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-2 text-sm font-medium">Corpus is empty</h3>
              <p className="mt-1 text-sm text-muted-foreground">Upload a document to build your RAG archive.</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default CorpusView;