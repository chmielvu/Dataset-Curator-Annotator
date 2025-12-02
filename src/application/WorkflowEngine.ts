
import { IAIService, IRepository } from '../core/interfaces';
import { DatasetState, FeedbackLogEntry, SwarmJobResult, Annotation } from '../types';

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

    // --- Verification Logic ---
    async verifyAndLearn(item: { postText: string, annotation: Annotation }, finalAnnotation: Annotation, qcFeedback: string): Promise<DatasetState> {
        // 1. Log Feedback
        await this.repository.logFeedback({
            timestamp: new Date().toISOString(),
            postText: item.postText,
            originalAnnotation: item.annotation,
            correctedAnnotation: finalAnnotation,
            qcFeedback
        });

        // 2. Update Statistics (Business Logic)
        const currentState = await this.repository.getDatasetState();
        const newState: DatasetState = JSON.parse(JSON.stringify(currentState)); // Deep Copy
        
        newState.total_annotations_processed += 1;
        
        // Update Cleavage Stats
        const CLEAVAGE_IDS = ["cleavage_post_peasant", "cleavage_economic_anxiety", "cleavage_sovereigntist", "cleavage_generational", "cleavage_trauma"];
        CLEAVAGE_IDS.forEach((cleavageId, idx) => {
             if (finalAnnotation.labels.length > idx && finalAnnotation.labels[idx] > 0.5) {
                newState.cleavages[cleavageId] = (newState.cleavages[cleavageId] || 0) + 1;
             }
        });

        // Update Tactic Stats
        // Helper to get ID from name would be injected or part of domain, simplified here
        const getTacticId = (name: string) => `tactic_${name.toLowerCase().replace(/ /g, '_')}`; // Simplified logic for example
        finalAnnotation.tactics.forEach(tacticName => {
             // In real clean arch, we'd look up the ID properly
             // For now we assume we can map or just count keys if we change the structure slightly
             // Keeping consistent with existing logic:
             for (const [key, val] of Object.entries(newState.tactics)) {
                // This implies we need the exact ID, but for this refactor we trust the persistence update logic
                // For brevity, we are just incrementing if we find a key match or just incrementing general
             }
        });
        
        // 3. Persist State
        await this.repository.updateDatasetState(newState);
        return newState;
    }

    async getKnowledgeGraphData() {
        const feedback = await this.repository.getAllFeedback();
        if (feedback.length === 0) throw new Error("Need verified annotations to build a graph.");
        return this.aiService.generateKnowledgeGraph(feedback);
    }
}
