
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
 * Implements a more sophisticated adaptive hybrid chunking strategy.
 * It respects semantic boundaries (paragraphs) while merging small chunks 
 * and splitting oversized ones to improve context quality for RAG.
 * @param text The source text to chunk.
 * @returns An array of text chunks.
 */
const intelligentChunkingStrategy = (text: string): string[] => {
    const TARGET_CHUNK_SIZE = 1000;
    const MAX_CHUNK_SIZE = 1500;
    const MIN_CHUNK_SIZE = 200;
    const CHUNK_OVERLAP = 100;

    if (!text) return [];

    // 1. Initial semantic split by paragraphs
    const paragraphs = text
        .replace(/\n{3,}/g, '\n\n') // Normalize newlines
        .split(/\n\s*\n/)
        .filter(p => p.trim().length > 0);

    const finalChunks: string[] = [];
    let smallChunkBuffer: string[] = [];

    const flushBuffer = () => {
        if (smallChunkBuffer.length > 0) {
            finalChunks.push(smallChunkBuffer.join('\n\n').trim());
            smallChunkBuffer = [];
        }
    };
    
    // Helper for oversized chunks
    const splitOversizedChunk = (chunk: string): string[] => {
        const subChunks: string[] = [];
        let i = 0;
        while (i < chunk.length) {
            const end = i + MAX_CHUNK_SIZE;
            subChunks.push(chunk.slice(i, end));
            i += MAX_CHUNK_SIZE - CHUNK_OVERLAP;
        }
        return subChunks;
    };

    // 2. Process each paragraph
    for (const p of paragraphs) {
        const trimmedParagraph = p.trim();

        if (trimmedParagraph.length > MAX_CHUNK_SIZE) {
            flushBuffer(); // Process any pending small chunks first
            const subChunks = splitOversizedChunk(trimmedParagraph);
            finalChunks.push(...subChunks);
        } else if (trimmedParagraph.length < MIN_CHUNK_SIZE) {
            smallChunkBuffer.push(trimmedParagraph);
            // If buffer is now big enough, flush it
            if (smallChunkBuffer.join('\n\n').length >= TARGET_CHUNK_SIZE) {
                flushBuffer();
            }
        } else { // Paragraph is a good size
            flushBuffer(); // Process any pending small chunks first
            finalChunks.push(trimmedParagraph);
        }
    }

    flushBuffer(); // Process any remaining small chunks

    return finalChunks.filter(chunk => chunk.length > 20);
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
          if (!resolver) return; // Already handled (e.g., by timeout)

          if (status === 'complete') {
            resolver.resolve(embedding);
          } else if (status === 'error') {
            resolver.reject(new Error(error));
          }
        };

        worker.onerror = (event) => {
            const errorMessage = `A critical error occurred in the embedding worker. RAG features will be unavailable. Please try reloading. Error: ${event.message}`;
            console.error('Embedding worker error:', event);
            
            // Reject all pending promises in the queue to unblock any waiting calls
            requestQueue.current.forEach(resolver => {
                resolver.reject(new Error(errorMessage));
            });
            requestQueue.current.clear();
    
            if (isMounted) {
              setInitializationError(errorMessage);
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
            return reject(new Error('Embedding worker is not initialized.'));
        }

        const timeoutId = setTimeout(() => {
            requestQueue.current.delete(textKey); // Clean up on timeout
            reject(new Error("Embedding generation timed out after 10 seconds."));
        }, 10000);

        requestQueue.current.set(textKey, {
            resolve: (embedding: number[]) => {
                clearTimeout(timeoutId);
                requestQueue.current.delete(textKey); // Clean up on success
                resolve(embedding);
            },
            reject: (error: any) => {
                clearTimeout(timeoutId);
                requestQueue.current.delete(textKey); // Clean up on error
                reject(error);
            }
        });

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
    // Use the new intelligent chunking strategy
    const chunks = intelligentChunkingStrategy(text);

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
