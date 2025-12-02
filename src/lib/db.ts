import Dexie, { Table } from 'dexie';

export interface DatasetState {
  cleavages: Record<string, number>;
  tactics: Record<string, number>;
  emotions: Record<string, number>;
  total_annotations_processed: number;
}

export interface Post {
  id?: number;
  text: string;
  source: 'swarm' | 'manual';
  status: 'queued' | 'annotated' | 'verified';
  annotation?: any; // Stored as JSON
  timestamp: string;
}

export interface Feedback {
  id?: number;
  postText: string;
  finalAnnotation: any;
  timestamp: string;
}

export interface DocChunk {
  id: string; // "docname-idx"
  source: string;
  text: string;
  embedding: number[];
}

class AppDB extends Dexie {
  posts!: Table<Post, number>;
  feedback!: Table<Feedback, number>;
  dataset!: Table<{ id: string; data: DatasetState }, string>;
  chunks!: Table<DocChunk, string>;

  constructor() {
    super('MagdalenkaSOTA_v3');
    (this as any).version(2).stores({
      posts: '++id, status, text',
      feedback: '++id, timestamp',
      dataset: 'id',
      chunks: 'id, source'
    });
  }
}

export const db = new AppDB();

export const INITIAL_STATE: DatasetState = {
  cleavages: {}, tactics: {}, emotions: {}, total_annotations_processed: 0
};