
export interface DatasetState {
  cleavages: {
    [key: string]: number; // e.g., 'cleavage_post_peasant': 10
  };
  tactics: {
    [key: string]: number; // e.g., 'tactic_loaded_language': 5
  };
  emotions: {
    [key: string]: number; // e.g., 'emotion_anger': 12
  };
}

export interface Annotation {
  // Based on BERT_finetuning_magdalenka_schema.json
  id: string;
  text: string;
  cleavages: number[];
  tactics: string[];
  emotion_fuel: string;
  stance_label: string;
  stance_target: string;
}
