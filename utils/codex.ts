
import { CLEAVAGE_IDS, TACTIC_IDS, EMOTION_IDS } from './constants';

// Manually created maps from Magdalenka Codex Classification.json to ensure data integrity.
// This is a critical fix to prevent mismatches from simplified, dynamically generated names.

const TACTIC_ID_TO_NAME_MAP = new Map([
    ["tactic_loaded_language", "Loaded Language"],
    ["tactic_dog_whistling", "Dog Whistling"],
    ["tactic_scapegoating", "Scapegoating"],
    ["tactic_appeal_to_fear", "Appeal to Fear"],
    ["tactic_appeal_to_pride", "Appeal to Pride/Patriotism"],
    ["tactic_appeal_to_authority", "Appeal to Authority"],
    ["tactic_gaslighting", "Gaslighting"],
    ["tactic_straw_man", "Straw Man / Misrepresentation"],
    ["tactic_ad_hominem", "Ad Hominem / Personal Attack"],
    ["tactic_false_dichotomy", "False Dichotomy"],
    ["tactic_whataboutism", "Whataboutism"],
    ["tactic_astroturfing", "Astroturfing / Coordinated Inauthenticity"],
    ["tactic_firehose_gish", "Firehose of Falsehood / Gish Gallop"],
    ["tactic_algorithmic_gaming", "Algorithmic Gaming"],
    ["tactic_narrative_hijacking", "Narrative Hijacking / Concept Hijacking"],
    ["tactic_moralization", "Moralization / Sanctimony"]
]);

const EMOTION_ID_TO_NAME_MAP = new Map([
    ["emotion_anger", "Anger / Outrage"],
    ["emotion_resentment", "Resentment / Righteous Indignation"],
    ["emotion_fear", "Fear / Anxiety"],
    ["emotion_pride", "Pride / Prideful Identity"],
    ["emotion_collective_victimhood", "Collective Victimhood"],
    ["emotion_hope", "Hope / Optimism"],
    ["emotion_frustration", "Frustration / Cynicism"],
    ["emotion_grief", "Grief / Mourning"],
    ["emotion_contempt", "Contempt"],
    ["emotion_solidarity", "Solidarity / Empathy"],
    ["emotion_apathy", "Apathy / Neutrality"]
]);

const CLEAVAGE_ID_TO_NAME_MAP = new Map([
    ["cleavage_post_peasant", "Post-Peasant / Elite vs Provincial"],
    ["cleavage_economic_anxiety", "Economic Anxiety / Survival & Fairness"],
    ["cleavage_sovereigntist", "Sovereigntist / National vs Global"],
    ["cleavage_generational", "Generational / Youth vs Establishment"],
    ["cleavage_trauma", "Trauma / Historical Victimhood"]
]);

const createReverseMap = (map: Map<string, string>): Map<string, string> => {
    const reverseMap = new Map<string, string>();
    for (const [key, value] of map.entries()) {
        reverseMap.set(value, key);
    }
    return reverseMap;
};

export const CLEAVAGE_ID_TO_NAME = CLEAVAGE_ID_TO_NAME_MAP;
export const TACTIC_ID_TO_NAME = TACTIC_ID_TO_NAME_MAP;
export const EMOTION_ID_TO_NAME = EMOTION_ID_TO_NAME_MAP;

export const CLEAVAGE_NAME_TO_ID = createReverseMap(CLEAVAGE_ID_TO_NAME_MAP);
export const TACTIC_NAME_TO_ID = createReverseMap(TACTIC_ID_TO_NAME_MAP);
export const EMOTION_NAME_TO_ID = createReverseMap(EMOTION_ID_TO_NAME_MAP);

export const getCleavageId = (name: string) => CLEAVAGE_NAME_TO_ID.get(name);
export const getTacticId = (name: string) => TACTIC_NAME_TO_ID.get(name);
export const getEmotionId = (name: string) => EMOTION_NAME_TO_ID.get(name);

export const getTacticName = (id: string) => TACTIC_ID_TO_NAME.get(id) || id;
export const getEmotionName = (id: string) => EMOTION_ID_TO_NAME.get(id) || id;
export const getCleavageName = (id: string) => CLEAVAGE_ID_TO_NAME.get(id) || id;
