export const CLEAVAGE_IDS = [
  "cleavage_post_peasant", "cleavage_economic_anxiety", "cleavage_sovereigntist", "cleavage_generational", "cleavage_trauma"
] as const;

export const TACTIC_IDS = [
  "tactic_loaded_language", "tactic_dog_whistling", "tactic_scapegoating", "tactic_appeal_to_fear", "tactic_appeal_to_pride",
  "tactic_appeal_to_authority", "tactic_gaslighting", "tactic_straw_man", "tactic_ad_hominem", "tactic_false_dichotomy",
  "tactic_whataboutism", "tactic_astroturfing", "tactic_firehose_gish", "tactic_algorithmic_gaming", "tactic_narrative_hijacking", "tactic_moralization"
] as const;

export const EMOTION_IDS = [
  "emotion_anger", "emotion_resentment", "emotion_fear", "emotion_pride", "emotion_collective_victimhood",
  "emotion_hope", "emotion_frustration", "emotion_grief", "emotion_contempt", "emotion_solidarity", "emotion_apathy"
] as const;

export const LABELS_MAP: Record<string, string> = {
  cleavage_post_peasant: "Post-Peasant / Elite vs Provincial",
  cleavage_economic_anxiety: "Economic Anxiety",
  cleavage_sovereigntist: "Sovereigntist",
  cleavage_generational: "Generational",
  cleavage_trauma: "Trauma / Historical",
  tactic_loaded_language: "Loaded Language",
  tactic_whataboutism: "Whataboutism",
  emotion_anger: "Anger/Outrage"
};

export const DEFINITIONS: Record<string, string> = {
  tactic_loaded_language: "Emotional vocabulary used to influence perception.",
  tactic_dog_whistling: "Coded language understood by a specific subgroup.",
  tactic_scapegoating: "Blaming a group for complex problems.",
  tactic_appeal_to_fear: "Mobilizing action through anxiety or threat.",
  tactic_ad_hominem: "Attacking the person instead of the argument.",
  tactic_whataboutism: "Deflecting criticism by pointing to others' faults.",
  emotion_anger: "High arousal, directed at an actor.",
  emotion_fear: "Anxiety about future safety or stability.",
  emotion_pride: "Celebration of group identity/nation."
};

export const getLabel = (id: string) => LABELS_MAP[id] || id.replace(/_/g, ' ');