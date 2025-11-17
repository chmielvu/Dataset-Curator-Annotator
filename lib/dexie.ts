
import Dexie, { Table } from 'dexie';
import { DocChunk, ArchiveSummary, DatasetState, FeedbackLogEntry, Draft } from '../types';

// Helper function for client-side vector search
function cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dotProduct = 0;
    let magA = 0;
    let magB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += (vecA[i] || 0) * (vecB[i] || 0);
        magA += (vecA[i] || 0) * (vecA[i] || 0);
        magB += (vecB[i] || 0) * (vecB[i] || 0);
    }
    magA = Math.sqrt(magA);
    magB = Math.sqrt(magB);
    if (magA === 0 || magB === 0) return 0;
    return dotProduct / (magA * magB);
}


class VectorDB extends Dexie {
  // FIX: Removed definite assignment assertion (!) as properties are now initialized in the constructor.
  chunks: Table<DocChunk, string>;
  dataset: Table<{ id: string; data: DatasetState }, string>;
  feedbackLog: Table<FeedbackLogEntry, number>; // The 'number' is the type of the primary key 'id'.
  drafts: Table<Draft, string>;

  constructor() {
    super('MagdalenkaVectorDB');
    // FIX: The TypeScript compiler is failing to recognize inherited methods from Dexie.
    // Casting 'this' to 'any' allows us to call 'version' and 'table' to set up the database schema
    // and correctly initialize the table properties.
    (this as any).version(1).stores({
      chunks: 'id, source',
    });
    (this as any).version(2).stores({
      chunks: 'id, source',
      dataset: '&id',
    });
    // Version 3 adds the feedbackLog table
    (this as any).version(3).stores({
      chunks: 'id, source',
      dataset: '&id',
      feedbackLog: '++id, timestamp', // ++id is auto-incrementing primary key, timestamp is an index.
    });
    // Version 4 adds the drafts table
    (this as any).version(4).stores({
      chunks: 'id, source',
      dataset: '&id',
      feedbackLog: '++id, timestamp',
      drafts: '&postText' // primary key on postText
    });
    
    // Explicitly initialize table properties to satisfy TypeScript and help type inference.
    this.chunks = (this as any).table('chunks');
    this.dataset = (this as any).table('dataset');
    this.feedbackLog = (this as any).table('feedbackLog');
    this.drafts = (this as any).table('drafts');
  }


  async addDocument(chunk: DocChunk): Promise<string> {
    return this.chunks.put(chunk);
  }

  async findSimilar(queryVector: number[], topK = 5): Promise<DocChunk[]> {
    if (!queryVector || queryVector.length === 0) return [];
    
    const allChunks = await this.chunks.toArray();
    if (allChunks.length > 5000) {
      console.warn(`[PERFORMANCE WARNING] Client-side vector search is scanning ${allChunks.length} chunks.`);
    }

    const scored = allChunks.map(chunk => ({
      ...chunk,
      similarity: cosineSimilarity(queryVector, chunk.embedding),
    }));
    return scored.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
  }

  async getArchiveSummary(): Promise<ArchiveSummary[]> {
    const summary = new Map<string, number>();
    await this.chunks.each((chunk) => {
      summary.set(chunk.source, (summary.get(chunk.source) || 0) + 1);
    });
    return Array.from(summary.entries()).map(([source, chunkCount]) => ({
      source,
      chunkCount,
    }));
  }

  async deleteSource(sourceName: string): Promise<void> {
    const chunksToDelete = await this.chunks.where('source').equals(sourceName).primaryKeys();
    await this.chunks.bulkDelete(chunksToDelete);
  }

  // ---- APO Feedback Methods ----
  async addFeedback(entry: Omit<FeedbackLogEntry, 'id'>): Promise<number> {
    return this.feedbackLog.add(entry as FeedbackLogEntry);
  }

  async getRecentFeedback(limit = 5): Promise<FeedbackLogEntry[]> {
    return this.feedbackLog.orderBy('timestamp').reverse().limit(limit).toArray();
  }
}

// Export a singleton instance of the database
export const db = new VectorDB();