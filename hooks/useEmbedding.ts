
import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../lib/dexie';
import { DocChunk } from '../types';

export interface EmbeddingStatus {
  title: string;
  progress: number;
  total: number;
}

export const useEmbedding = () => {
  const workerRef = useRef<Worker | null>(null);
  const requestQueue = useRef(new Map<string, { resolve: (embedding: number[]) => void; reject: (error: any) => void }>());
  
  const [isReady, setIsReady] = useState(false);
  const [status, setStatus] = useState<EmbeddingStatus | null>(null);

  useEffect(() => {
    if (!workerRef.current) {
      try {
        const worker = new Worker(new URL('../public/embedding-worker.js', import.meta.url), { type: 'module' });
        workerRef.current = worker;

        worker.onmessage = (event) => {
          const { status, embedding, error, textKey } = event.data;
          
          if (status === 'ready') {
            setIsReady(true);
          }

          const resolver = requestQueue.current.get(textKey);
          if (!resolver) return;

          if (status === 'complete') {
            resolver.resolve(embedding);
          } else if (status === 'error') {
            resolver.reject(new Error(error));
          }
          requestQueue.current.delete(textKey);
        };

        worker.onerror = (event) => {
          console.error('Embedding worker error:', event);
          setIsReady(false);
        };

      } catch (e) {
        console.error('Failed to initialize embedding worker:', e);
        setIsReady(false);
      }
    }

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const generateEmbedding = useCallback((text: string): Promise<number[]> => {
    const textKey = `${Date.now()}-${Math.random()}`;
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Embedding worker is not initialized.'));
        return;
      }
      requestQueue.current.set(textKey, { resolve, reject });
      workerRef.current.postMessage({ type: 'generate-embedding', text, textKey });
    });
  }, []);

  const processAndEmbedDocument = useCallback(async (docName: string, text: string) => {
    const chunks = text.split(/\n\s*\n/).filter((t) => t.trim().length > 20); // Split by blank lines
    const totalChunks = chunks.length;
    if (totalChunks === 0) return;

    setStatus({ title: `Embedding ${docName}`, progress: 0, total: totalChunks });

    for (const [index, chunkText] of chunks.entries()) {
      const embedding = await generateEmbedding(chunkText);
      const docChunk: DocChunk = {
        id: `${docName}-${index}`,
        source: docName,
        text: chunkText,
        embedding: embedding,
      };
      await db.addDocument(docChunk);
      setStatus({ title: `Embedding ${docName}`, progress: index + 1, total: totalChunks });
    }
    
    setStatus({ title: `Embedded ${docName}`, progress: totalChunks, total: totalChunks });
    setTimeout(() => setStatus(null), 2000);
  }, [generateEmbedding]);

  return { isReady, status, processAndEmbedDocument };
};
