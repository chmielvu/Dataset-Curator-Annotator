
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
  total_annotations_processed: number;
}

export interface Annotation {
  id: string;
  text: string;
  labels: number[]; // Formerly 'cleavages'
  tactics: string[]; // Now human-readable, e.g., "Loaded Language"
  emotion_fuel: string; // Now human-readable, e.g., "Anger"
  stance_label: string;
  stance_target: string;
  confidence?: number;
}

// ---- App Navigation ----
export type AppView = 'curator' | 'annotator' | 'verification' | 'corpus' | 'dashboard';

// ---- RAG Types ----

export interface DocChunk {
  id: string; // Primary key (e.g., "my-file.txt-0")
  text: string;
  embedding: number[];
  source: string; // Indexed source name (e.g., "my-file.txt")
}

export interface ArchiveSummary {
  source: string;
  chunkCount: number;
}

// ---- APO & Batch Processing ----
export interface Draft {
  postText: string;
  annotation: Annotation;
}

export interface FeedbackLogEntry {
  id?: number;
  timestamp: string;
  postText: string;
  originalAnnotation: Annotation;
  correctedAnnotation: Annotation;
  qcFeedback: string;
}

export interface QCCompletionData {
  finalAnnotation: Annotation;
  originalAnnotation: Annotation;
  wasEdited: boolean;
  qcAgentFeedback: string | null;
}

// ---- Generative UI & QC Agent ----
interface BaseUiSuggestion {
  field_path: string; // e.g., "labels[1]", "tactics", "stance_target"
  rationale: string;
}

export interface SliderSuggestion extends BaseUiSuggestion {
  control_type: 'slider';
  suggestion: number;
}

export interface MultiSelectSuggestion extends BaseUiSuggestion {
  control_type: 'multiselect';
  suggestion: string[]; // The full suggested array of human-readable tactic names
}

export interface TextSuggestion extends BaseUiSuggestion {
  control_type: 'text';
  suggestion: string;
}

export interface SelectSuggestion extends BaseUiSuggestion {
  control_type: 'select';
  suggestion: string;
}

export type UiSuggestion = SliderSuggestion | MultiSelectSuggestion | TextSuggestion | SelectSuggestion;

export interface QcAgentResult {
  qc_passed: boolean;
  feedback: string;
  ui_suggestions: UiSuggestion[];
}


// ---- Swarm Curator Architecture ----
export type SwarmJobStage = 'IDLE' | 'PLANNING' | 'EXECUTING_SWARM' | 'SYNTHESIZING' | 'COMPLETE' | 'FAILED';

export interface SwarmJobStatus {
  jobId: string;
  stage: SwarmJobStage;
  message: string;
  progress?: number;
  total?: number;
  result?: SwarmJobResult | null;
  log?: string[];
}

export interface SpecialistAgentResult {
  agentName: 'Balancer' | 'Explorer' | 'Wildcard' | 'Manual';
  contributedPosts: string[];
  executedQueries: string;
  log: string;
}

export interface SwarmJobResult {
  finalPosts: string[];
  triggerSuggestions: string[];
  agentReports: SpecialistAgentResult[];
}
