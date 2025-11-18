
import Dexie, { Table } from 'dexie';
import { DocChunk, ArchiveSummary, DatasetState, FeedbackLogEntry, Draft, VerificationQueueItem, Annotation } from '../types';

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
  chunks: Table<DocChunk, string>;
  dataset: Table<{ id: string; data: DatasetState }, string>;
  feedbackLog: Table<FeedbackLogEntry, number>;
  drafts: Table<Draft, string>;
  curationQueue: Table<{ id?: number; postText: string }, number>;
  verificationQueue: Table<VerificationQueueItem, number>;

  constructor() {
    super('MagdalenkaVectorDB');
    (this as any).version(6).stores({
      chunks: 'id, source',
      dataset: '&id',
      feedbackLog: '++id, timestamp',
      drafts: '&postText',
      curationQueue: '++id, &postText',
      verificationQueue: '++id'
    });
    
    this.chunks = (this as any).table('chunks');
    this.dataset = (this as any).table('dataset');
    this.feedbackLog = (this as any).table('feedbackLog');
    this.drafts = (this as any).table('drafts');
    this.curationQueue = (this as any).table('curationQueue');
    this.verificationQueue = (this as any).table('verificationQueue');
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

  // ---- Curation Queue Methods ----
  async addPostsToQueue(posts: string[]): Promise<number> {
    const existingCount = await this.curationQueue.count();
    const items = posts.map(p => ({ postText: p }));
    await this.curationQueue.bulkPut(items).catch('BulkError', () => {
        // This is expected when there are duplicates due to the unique index.
        // Dexie's bulkPut handles this gracefully; it will insert what it can.
    });
    const newCount = await this.curationQueue.count();
    return newCount - existingCount; // Return number of new posts actually added
  }

  async getQueueCount(): Promise<number> {
    return this.curationQueue.count();
  }
  
  async getQueue(): Promise<string[]> {
    const items = await this.curationQueue.orderBy('id').toArray();
    return items.map(item => item.postText);
  }

  async dequeuePost(): Promise<string | undefined> {
    const firstItem = await this.curationQueue.orderBy('id').first();
    if (firstItem && typeof firstItem.id !== 'undefined') {
      await this.curationQueue.delete(firstItem.id);
      return firstItem.postText;
    }
    return undefined;
  }
  
  async clearQueue(): Promise<void> {
    await this.curationQueue.clear();
  }

  // ---- Verification Queue Methods ----
  async addForVerification(postText: string, annotation: Annotation): Promise<number> {
    return this.verificationQueue.add({ postText, annotation });
  }

  async getVerificationQueueCount(): Promise<number> {
      return this.verificationQueue.count();
  }

  async dequeueForVerification(): Promise<VerificationQueueItem | undefined> {
      const firstItem = await this.verificationQueue.orderBy('id').first();
      if (firstItem && typeof firstItem.id !== 'undefined') {
          await this.verificationQueue.delete(firstItem.id);
          return firstItem;
      }
      return undefined;
  }
}

// Export a singleton instance of the database
export const db = new VectorDB();
