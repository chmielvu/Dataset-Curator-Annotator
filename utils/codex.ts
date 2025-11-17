
import { CLEAVAGE_IDS, TACTIC_IDS, EMOTION_IDS } from './constants';

const createMap = (ids: readonly string[]): Map<string, string> => {
  const map = new Map<string, string>();
  ids.forEach(id => {
    const humanReadable = id.replace(/^(cleavage|tactic|emotion)_/, '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    map.set(humanReadable, id);
  });
  return map;
};

const createReverseMap = (ids: readonly string[]): Map<string, string> => {
    const map = new Map<string, string>();
    ids.forEach(id => {
      const humanReadable = id.replace(/^(cleavage|tactic|emotion)_/, '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      map.set(id, humanReadable);
    });
    return map;
};


export const TACTIC_NAME_TO_ID = createMap(TACTIC_IDS);
export const EMOTION_NAME_TO_ID = createMap(EMOTION_IDS);

export const CLEAVAGE_ID_TO_NAME = createReverseMap(CLEAVAGE_IDS);
export const TACTIC_ID_TO_NAME = createReverseMap(TACTIC_IDS);
export const EMOTION_ID_TO_NAME = createReverseMap(EMOTION_IDS);

export const getTacticId = (name: string) => TACTIC_NAME_TO_ID.get(name);
export const getEmotionId = (name: string) => EMOTION_NAME_TO_ID.get(name);

export const getTacticName = (id: string) => TACTIC_ID_TO_NAME.get(id) || id;
export const getEmotionName = (id: string) => EMOTION_ID_TO_NAME.get(id) || id;
export const getCleavageName = (id: string) => CLEAVAGE_ID_TO_NAME.get(id) || id;
