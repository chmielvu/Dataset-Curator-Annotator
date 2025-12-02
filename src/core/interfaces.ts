
import { Annotation, DatasetState, FeedbackLogEntry, QcAgentResult, SwarmJobResult } from "../types";

// Infrastructure Port: AI Service
export interface IAIService {
    runCuratorSwarm(datasetState: DatasetState, manualQuery: string, feedback: FeedbackLogEntry[]): Promise<SwarmJobResult>;
    runAutoAnnotator(postText: string): Promise<Annotation>;
    runQCCheck(postText: string, annotation: Annotation): Promise<QcAgentResult>;
    generateKnowledgeGraph(feedbackLog: FeedbackLogEntry[]): Promise<any>;
}

// Infrastructure Port: Data Repository
export interface IRepository {
    getDatasetState(): Promise<DatasetState>;
    updateDatasetState(newState: DatasetState): Promise<void>;
    
    // Queue Management
    getQueueCount(): Promise<number>;
    getVerificationQueueCount(): Promise<number>;
    enqueuePosts(posts: string[]): Promise<number>;
    dequeuePost(): Promise<string | undefined>;
    
    // Verification
    addToVerification(post: string, annotation: Annotation): Promise<void>;
    dequeueForVerification(): Promise<{ id?: number; postText: string; annotation: Annotation } | undefined>;
    
    // Feedback/Logs
    getRecentFeedback(limit: number): Promise<FeedbackLogEntry[]>;
    logFeedback(entry: FeedbackLogEntry): Promise<void>;
    getAllFeedback(): Promise<FeedbackLogEntry[]>;
}
