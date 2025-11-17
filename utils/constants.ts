
// Based on Magdalenka Codex Classification.json

// The order MUST match the model's output array
export const CLEAVAGE_IDS = [
    "cleavage_post_peasant",
    "cleavage_economic_anxiety",
    "cleavage_sovereigntist",
    "cleavage_generational",
    "cleavage_trauma"
];

// Based on Magdalenka Codex Classification.json
export const TACTIC_IDS = [
    "tactic_loaded_language",
    "tactic_dog_whistling",
    "tactic_scapegoating",
    "tactic_appeal_to_fear",
    "tactic_appeal_to_pride",
    "tactic_appeal_to_authority",
    "tactic_gaslighting",
    "tactic_straw_man",
    "tactic_ad_hominem",
    "tactic_false_dichotomy",
    "tactic_whataboutism",
    "tactic_astroturfing",
    "tactic_firehose_gish",
    "tactic_algorithmic_gaming",
    "tactic_narrative_hijacking",
    "tactic_moralization"
];

// Based on Magdalenka Codex Classification.json
export const EMOTION_IDS = [
    "emotion_anger",
    "emotion_resentment",
    "emotion_fear",
    "emotion_pride",
    "emotion_collective_victimhood",
    "emotion_hope",
    "emotion_frustration",
    "emotion_grief",
    "emotion_contempt",
    "emotion_solidarity",
    "emotion_apathy"
];

// Based on public/BERT_finetuning_magdalenka_schema.json
export const STANCE_LABELS = [
    "AGAINST",
    "FOR",
    "NEUTRAL",
];

// NEW: Updated color mapping for visual identifiers
export const CLEAVAGE_COLORS: { [key: string]: string } = {
    "cleavage_post_peasant": "bg-green-200 text-green-900 dark:bg-green-800 dark:text-green-100",
    "cleavage_economic_anxiety": "bg-yellow-200 text-yellow-900 dark:bg-yellow-800 dark:text-yellow-100",
    "cleavage_sovereigntist": "bg-purple-200 text-purple-900 dark:bg-purple-800 dark:text-purple-100",
    "cleavage_generational": "bg-pink-200 text-pink-900 dark:bg-pink-800 dark:text-pink-100",
    "cleavage_trauma": "bg-cyan-200 text-cyan-900 dark:bg-cyan-800 dark:text-cyan-100"
};
