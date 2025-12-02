import { create } from 'zustand';
import { db, DatasetState, INITIAL_STATE } from './lib/db';

interface AppState {
  view: 'dashboard' | 'curator' | 'annotator' | 'rag';
  setView: (v: 'dashboard' | 'curator' | 'annotator' | 'rag') => void;
  datasetState: DatasetState;
  refreshStats: () => Promise<void>;
  
  // Curator State
  isSwarmActive: boolean;
  swarmLog: string[];
  setSwarmActive: (active: boolean) => void;
  addSwarmLog: (msg: string) => void;

  // Annotator State
  annotatorQueueCount: number;
}

export const useStore = create<AppState>((set) => ({
  view: 'dashboard',
  setView: (view) => set({ view }),
  datasetState: INITIAL_STATE,
  refreshStats: async () => {
    const entry = await db.dataset.get('currentState');
    const count = await db.posts.where('status').equals('queued').count();
    set({ 
      datasetState: entry?.data || INITIAL_STATE,
      annotatorQueueCount: count
    });
  },

  isSwarmActive: false,
  swarmLog: [],
  setSwarmActive: (isSwarmActive) => set({ isSwarmActive }),
  addSwarmLog: (msg) => set(state => ({ swarmLog: [...state.swarmLog.slice(-9), msg] })),

  annotatorQueueCount: 0
}));