import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../lib/dexie';
import { DocChunk } from '../types';

export interface EmbeddingStatus {
  title: string;
  progress: number;
  total: number;
}

export interface ChunkError {
  docName: string;
  chunkText: string;
  chunkIndex: number;
  total: number;
  error: any;
}

/**
 * Implements a fixed-size, overlapping chunking strategy.
 * @param text The source text to chunk.
 * @param chunkSize The character length of each chunk.
 * @param chunkOverlap The number of characters to overlap between chunks.
 * @returns An array of text chunks.
 */
const createOverlappingChunks = (text: string, chunkSize: number, chunkOverlap: number): string[] => {
    if (chunkSize <= chunkOverlap) {
        console.error("Chunk size must be greater than chunk overlap. Defaulting to paragraph splitting.");
        return text.split(/\n\s*\n/).filter((t) => t.trim().length > 20);
    }
    if (!text) return [];

    const chunks: string[] = [];
    let i = 0;
    while (i < text.length) {
        const end = i + chunkSize;
        chunks.push(text.slice(i, end));
        i += chunkSize - chunkOverlap;
    }
    return chunks.filter(chunk => chunk.trim().length > 20); // Also filter small final chunks
};


export const useEmbedding = () => {
  const workerRef = useRef<Worker | null>(null);
  const workerUrlRef = useRef<string | null>(null);
  const requestQueue = useRef(new Map<string, { resolve: (embedding: number[]) => void; reject: (error: any) => void }>());
  
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<EmbeddingStatus | null>(null);
  const [chunkError, setChunkError] = useState<ChunkError | null>(null);
  const [initializationError, setInitializationError] = useState<string | null>(null);

  const processQueueRef = useRef<{ chunkText: string; index: number }[]>([]);
  const currentJobRef = useRef<{ docName: string; total: number } | null>(null);

  useEffect(() => {
    let isMounted = true;
    const initializeWorker = async () => {
      if (workerRef.current) return;
      try {
        const response = await fetch('/embedding-worker.js');
        if (!response.ok) {
          throw new Error(`Failed to fetch worker script: ${response.statusText}`);
        }
        const scriptText = await response.text();
        
        const blob = new Blob([scriptText], { type: 'application/javascript' });
        const objectUrl = URL.createObjectURL(blob);
        workerUrlRef.current = objectUrl;

        const worker = new Worker(objectUrl, { type: 'module' });
        
        if (isMounted) {
          workerRef.current = worker;
        } else {
           URL.revokeObjectURL(objectUrl);
           return;
        }

        worker.onmessage = (event) => {
          const { status, embedding, error, textKey } = event.data;

          if (status === 'loading') {
            setIsLoading(true);
            return;
          }

          if (status === 'ready') {
            setIsLoading(false);
            setIsReady(true);
            return;
          }

          // Global initialization error
          if (status === 'error' && !textKey) {
            setIsLoading(false);
            setIsReady(false);
            setInitializationError(error);
            return;
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
          if (isMounted) {
            setInitializationError(`A critical error occurred in the embedding worker. RAG features will be unavailable. Please try reloading. Error: ${event.message}`);
            setIsReady(false);
            setIsLoading(false);
          }
        };

      } catch (e: any) {
        console.error('Failed to initialize embedding worker:', e);
        if (isMounted) {
          setInitializationError(`Failed to load the embedding model, which is required for RAG features. This might be a network issue or a temporary problem. Please try reloading the page. Error: ${e.message}`);
          setIsReady(false);
          setIsLoading(false);
        }
      }
    };
    
    initializeWorker();

    return () => {
      isMounted = false;
      workerRef.current?.terminate();
      workerRef.current = null;
      if (workerUrlRef.current) {
        URL.revokeObjectURL(workerUrlRef.current);
        workerUrlRef.current = null;
      }
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
  
  const processNextChunk = useCallback(async () => {
    if (processQueueRef.current.length === 0) {
      if (currentJobRef.current) {
        setStatus({
          title: `Embedded ${currentJobRef.current.docName}`,
          progress: currentJobRef.current.total,
          total: currentJobRef.current.total,
        });
        currentJobRef.current = null;
        setTimeout(() => setStatus(null), 2000);
      }
      return;
    }

    const { chunkText, index } = processQueueRef.current.shift()!;
    const { docName, total } = currentJobRef.current!;

    try {
      const embedding = await generateEmbedding(chunkText);
      const docChunk: DocChunk = {
        id: `${docName}-${index}`,
        source: docName,
        text: chunkText,
        embedding: embedding,
      };
      await db.addDocument(docChunk);
      setStatus({ title: `Embedding ${docName}`, progress: index + 1, total: total });

      await processNextChunk();
    } catch (err: any) {
      setChunkError({
        docName,
        chunkText,
        chunkIndex: index,
        total,
        error: err,
      });
    }
  }, [generateEmbedding]);
  
  const processAndEmbedDocument = useCallback(async (docName: string, text: string) => {
    const CHUNK_SIZE_CHARS = 1000;
    const CHUNK_OVERLAP_CHARS = 100;
    
    // Replace simple paragraph splitting with a more robust overlapping chunk strategy.
    const chunks = createOverlappingChunks(text, CHUNK_SIZE_CHARS, CHUNK_OVERLAP_CHARS);

    const totalChunks = chunks.length;
    if (totalChunks === 0) {
      console.warn(`Document ${docName} resulted in 0 chunks after processing.`);
      return;
    };

    processQueueRef.current = chunks.map((chunkText, index) => ({ chunkText, index }));
    currentJobRef.current = { docName, total: totalChunks };
    
    setChunkError(null);
    setStatus({ title: `Embedding ${docName}`, progress: 0, total: totalChunks });

    await processNextChunk();
  }, [processNextChunk]);
  
  const retryChunk = useCallback(async () => {
    if (!chunkError) return;
    
    const { docName, chunkText, chunkIndex, total } = chunkError;
    setChunkError(null);

    try {
      const embedding = await generateEmbedding(chunkText);
      const docChunk: DocChunk = {
        id: `${docName}-${chunkIndex}`,
        source: docName,
        text: chunkText,
        embedding: embedding,
      };
      await db.addDocument(docChunk);
      setStatus({ title: `Embedding ${docName}`, progress: chunkIndex + 1, total: total });
      
      await processNextChunk();
    } catch (err: any) {
      setChunkError({
        docName,
        chunkText,
        chunkIndex,
        total,
        error: err,
      });
    }
  }, [chunkError, generateEmbedding, processNextChunk]);

  const skipChunk = useCallback(async () => {
    if (!chunkError) return;
    setChunkError(null);
    await processNextChunk();
  }, [chunkError, processNextChunk]);


  return { isReady, isLoading, status, processAndEmbedDocument, generateEmbedding, chunkError, retryChunk, skipChunk, initializationError };
};