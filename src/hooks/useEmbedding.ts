import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../lib/db';
import { DocChunk } from '../lib/db';

export const useEmbedding = () => {
  const workerRef = useRef<Worker | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [status, setStatus] = useState<{ msg: string; progress: number } | null>(null);

  useEffect(() => {
    // Initialize Web Worker
    const worker = new Worker('/embedding-worker.js', { type: 'module' });
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const { status } = e.data;
      if (status === 'ready') setIsReady(true);
    };

    return () => worker.terminate();
  }, []);

  const generateEmbedding = useCallback((text: string): Promise<number[]> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) return reject("Worker not ready");
      
      const id = Math.random().toString();
      const handler = (e: MessageEvent) => {
        if (e.data.textKey === id) {
          workerRef.current?.removeEventListener('message', handler);
          if (e.data.status === 'complete') resolve(e.data.embedding);
          else reject(e.data.error);
        }
      };
      
      workerRef.current.addEventListener('message', handler);
      workerRef.current.postMessage({ type: 'generate-embedding', text, textKey: id });
    });
  }, []);

  const processFile = async (filename: string, content: string) => {
    // Simple semantic chunking by newlines/paragraphs
    const rawChunks = content.split(/\n\s*\n/).filter(c => c.trim().length > 50);
    const total = rawChunks.length;
    
    for (let i = 0; i < total; i++) {
      const chunkText = rawChunks[i];
      setStatus({ msg: `Embedding chunk ${i+1}/${total}`, progress: (i/total)*100 });
      
      try {
        const embedding = await generateEmbedding(chunkText);
        await db.chunks.put({
          id: `${filename}-${i}`,
          source: filename,
          text: chunkText,
          embedding
        });
      } catch (e) {
        console.error("Chunk failed", e);
      }
    }
    setStatus(null);
  };

  return { isReady, status, processFile };
};