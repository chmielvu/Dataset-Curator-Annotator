
import { DatasetState } from '../types';
import { CLEAVAGE_IDS, TACTIC_IDS, EMOTION_IDS } from './constants';

const initializeCounts = (keys: string[]): { [key: string]: number } => {
  return keys.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {} as { [key: string]: number });
};

export const INITIAL_DATASET_STATE: DatasetState = {
  cleavages: initializeCounts(CLEAVAGE_IDS),
  tactics: initializeCounts(TACTIC_IDS),
  emotions: initializeCounts(EMOTION_IDS),
  total_annotations_processed: 0,
};
