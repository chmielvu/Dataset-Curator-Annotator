
import { IAIService, IRepository } from '../core/interfaces';
import { DatasetState, FeedbackLogEntry, SwarmJobResult, Annotation } from '../types';
import { CLEAVAGE_IDS } from '../utils/constants';

export class WorkflowEngine {
    constructor(
        private aiService: IAIService,
        private repository: IRepository
    ) {}

    // --- Curator Swarm Logic ---
    async runCurationBatch(batchIndex: number, manualQuery: string): Promise<{ result: SwarmJobResult, addedCount: number }> {
        // 1. Get Context
        const datasetState = await this.repository.getDatasetState();
        let feedback: FeedbackLogEntry[] = [];
        try { feedback = await this.repository.getRecentFeedback(5); } catch(e) {}

        // 2. Run AI Swarm
        const result = await this.aiService.runCuratorSwarm(datasetState, manualQuery, feedback);

        // 3. Persist
        let addedCount = 0;
        if (result.finalPosts && result.finalPosts.length > 0) {
            addedCount = await this.repository.enqueuePosts(result.finalPosts);
        }

        return { result, addedCount };
    }

    // --- Annotation Loop Logic ---
    async processNextAnnotationItem(): Promise<{ success: boolean, post?: string, annotation?: Annotation, error?: string }> {
        // 1. Dequeue
        const post = await this.repository.dequeuePost();
        if (!post) return { success: false, error: "Queue empty" };

        try {
            // 2. AI Analysis
            const annotation = await this.aiService.runAutoAnnotator(post);
            
            // 3. Store for Verification
            await this.repository.addToVerification(post, annotation);
            return { success: true, post, annotation };
        } catch (e: any) {
            return { success: false, post, error: e.message };
        }
    }

    // --- Verification & Learning Logic ---
    
    // Core function to update state based on a verified/corrected annotation
    private async processVerifiedAnnotation(postText: string, originalAnnotation: Annotation, finalAnnotation: Annotation, qcFeedback: string): Promise<DatasetState> {
         // 1. Log Feedback
         await this.repository.logFeedback({
            timestamp: new Date().toISOString(),
            postText: postText,
            originalAnnotation: originalAnnotation,
            correctedAnnotation: finalAnnotation,
            qcFeedback
        });

        // 2. Update Statistics (Business Logic)
        const currentState = await this.repository.getDatasetState();
        const newState: DatasetState = JSON.parse(JSON.stringify(currentState)); // Deep Copy
        
        newState.total_annotations_processed += 1;
        
        // Update Cleavage Stats
        CLEAVAGE_IDS.forEach((cleavageId, idx) => {
             if (finalAnnotation.labels.length > idx && finalAnnotation.labels[idx] > 0.5) {
                newState.cleavages[cleavageId] = (newState.cleavages[cleavageId] || 0) + 1;
             }
        });
        
        // 3. Persist State
        await this.repository.updateDatasetState(newState);
        return newState;
    }

    async verifyAndLearn(item: { postText: string, annotation: Annotation }, finalAnnotation: Annotation, qcFeedback: string): Promise<DatasetState> {
        return this.processVerifiedAnnotation(item.postText, item.annotation, finalAnnotation, qcFeedback);
    }
    
    async submitManualAnnotation(postText: string, annotation: Annotation, qcFeedback: string): Promise<DatasetState> {
        // For manual annotations, the "original" is the same as the final if no AI was involved, 
        // or we can treat the manual input as the ground truth.
        return this.processVerifiedAnnotation(postText, annotation, annotation, qcFeedback);
    }
}
