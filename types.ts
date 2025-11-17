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
  // Based on BERT_finetuning_magdalenka_schema.json
  id: string;
  text: string;
  cleavages: number[];
  tactics: string[];
  emotion_fuel: string;
  stance_label: string;
  stance_target: string;
  confidence?: number;
}

// ---- App Navigation ----
export type AppView = 'curator' | 'annotator' | 'qc' | 'corpus' | 'dashboard';

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