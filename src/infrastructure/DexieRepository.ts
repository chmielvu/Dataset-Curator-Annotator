
import { db } from '../lib/dexie';
import { IRepository } from '../core/interfaces';
import { DatasetState, Annotation, FeedbackLogEntry } from '../types';
import { INITIAL_DATASET_STATE } from '../utils/initialState';

export class DexieRepository implements IRepository {
    
    async getDatasetState(): Promise<DatasetState> {
        const stats = await db.dataset.get('currentState');
        return stats ? stats.data : INITIAL_DATASET_STATE;
    }

    async updateDatasetState(newState: DatasetState): Promise<void> {
        await db.dataset.put({ id: 'currentState', data: newState });
    }

    async getQueueCount(): Promise<number> {
        return db.getQueueCount();
    }

    async getVerificationQueueCount(): Promise<number> {
        return db.getVerificationQueueCount();
    }

    async enqueuePosts(posts: string[]): Promise<number> {
        return db.addPostsToQueue(posts);
    }

    async dequeuePost(): Promise<string | undefined> {
        return db.dequeuePost();
    }

    async addToVerification(post: string, annotation: Annotation): Promise<void> {
        await db.addForVerification(post, annotation);
    }

    async dequeueForVerification(): Promise<{ id?: number; postText: string; annotation: Annotation } | undefined> {
        return db.dequeueForVerification();
    }

    async getRecentFeedback(limit: number): Promise<FeedbackLogEntry[]> {
        return db.getRecentFeedback(limit);
    }

    async logFeedback(entry: FeedbackLogEntry): Promise<void> {
        await db.addFeedback(entry);
    }

    async getAllFeedback(): Promise<FeedbackLogEntry[]> {
        return db.feedbackLog.toArray();
    }
}
