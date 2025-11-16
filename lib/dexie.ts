
import Dexie, { Table } from 'dexie';
import { DocChunk, ArchiveSummary } from '../types';

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
  chunks!: Table<DocChunk, string>;

  constructor() {
    super('MagdalenkaVectorDB');
    // FIX: Broke method chain to help TypeScript's type inference resolve the 'version' property correctly.
    const dbVersion = this.version(1);
    dbVersion.stores({
      chunks: 'id, source', // Primary key 'id', index on 'source'
    });
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
}

// Export a singleton instance of the database
export const db = new VectorDB();
