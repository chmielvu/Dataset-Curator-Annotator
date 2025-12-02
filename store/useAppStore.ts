import { create } from 'zustand';
import { db } from '../lib/dexie';
import { DatasetState, AppView, CurationJob, SwarmJobResult, VerificationQueueItem, Annotation, FeedbackLogEntry } from '../types';
import { INITIAL_DATASET_STATE } from '../utils/initialState';
import { getTacticId, getEmotionId } from '../utils/codex';
import { CLEAVAGE_IDS } from '../utils/constants';
import { toast } from 'sonner';
import { runCurationSwarmAction, runAutoAnnotatorAction } from '../actions';

interface AppState {
    currentView: AppView;
    theme: 'dark' | 'light';
    datasetState: DatasetState;
    queueCounts: { curation: number; verification: number };
    curationJob: CurationJob | null;
    lastSwarmReport: SwarmJobResult | null;
    curationLog: string[];
    isAnnotatorRunning: boolean;
    annotatorProgress: number;
    annotatorLogs: string[];
    currentVerificationItem: VerificationQueueItem | null;
    
    setView: (view: AppView) => void;
    toggleTheme: () => void;
    initializeData: () => Promise<void>;
    startCurationJob: (batches: number, manualQuery: string) => Promise<void>;
    stopCurationJob: () => void;
    startAutoAnnotator: () => Promise<void>;
    stopAutoAnnotator: () => void;
    loadNextVerificationItem: () => Promise<void>;
    submitVerification: (finalAnnotation: Annotation, wasEdited: boolean, qcFeedback: string) => Promise<void>;
    skipVerificationItem: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
    currentView: 'dashboard',
    theme: 'dark',
    datasetState: INITIAL_DATASET_STATE,
    queueCounts: { curation: 0, verification: 0 },
    curationJob: null,
    lastSwarmReport: null,
    curationLog: [],
    isAnnotatorRunning: false,
    annotatorProgress: 0,
    annotatorLogs: [],
    currentVerificationItem: null,

    setView: (view) => set({ currentView: view }),
    toggleTheme: () => {
        const newTheme = get().theme === 'dark' ? 'light' : 'dark';
        set({ theme: newTheme });
        document.documentElement.classList.remove('dark', 'light');
        document.documentElement.classList.add(newTheme);
    },

    initializeData: async () => {
        try {
            const c = await db.getQueueCount();
            const v = await db.getVerificationQueueCount();
            const stats = await db.dataset.get('currentState');
            set({ 
                queueCounts: { curation: c, verification: v },
                datasetState: stats ? stats.data : INITIAL_DATASET_STATE 
            });
        } catch (e) {
            console.error("Init failed:", e);
        }
    },

    startCurationJob: async (batchesToRun, manualQuery) => {
        if (get().curationJob?.isActive) return;

        set({ 
            curationJob: { isActive: true, isCancelled: false, batchesRequested: batchesToRun, batchesCompleted: 0, postsFound: 0 },
            curationLog: ["Initializing Curator Swarm (Gemini 2.5 Flash Thinking)..."]
        });

        const log = (msg: string) => set(s => ({ curationLog: [...s.curationLog.slice(-9), msg] }));

        for (let i = 0; i < batchesToRun; i++) {
            if (get().curationJob?.isCancelled || !get().curationJob?.isActive) break;

            log(`Batch ${i+1}/${batchesToRun}: Thinking & Planning...`);
            
            try {
                let feedback: FeedbackLogEntry[] = [];
                try { feedback = await db.getRecentFeedback(5); } catch(e) {}

                // Execute Server Action directly (Client-side implementation)
                const result = await runCurationSwarmAction(get().datasetState, manualQuery, feedback);

                if (result.finalPosts && result.finalPosts.length > 0) {
                    const added = await db.addPostsToQueue(result.finalPosts);
                    log(`Batch ${i+1}: Swarm found ${added} unique posts.`);
                    set(s => ({ 
                        curationJob: s.curationJob ? { ...s.curationJob, postsFound: s.curationJob.postsFound + added } : null,
                        lastSwarmReport: result
                    }));
                    await get().initializeData();
                } else {
                    log(`Batch ${i+1}: No new relevant posts found.`);
                }

                set(s => ({ curationJob: s.curationJob ? { ...s.curationJob, batchesCompleted: i + 1 } : null }));

            } catch (e: any) {
                log(`Error: ${e.message}`);
                toast.error("Batch failed", { description: e.message });
                break;
            }

            if (i < batchesToRun - 1 && get().curationJob?.isActive) {
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        set(s => ({ curationJob: s.curationJob ? { ...s.curationJob, isActive: false } : null }));
        log("Mission Complete.");
    },

    stopCurationJob: () => {
        set(s => ({ curationJob: s.curationJob ? { ...s.curationJob, isCancelled: true, isActive: false } : null }));
    },

    startAutoAnnotator: async () => {
        if (get().isAnnotatorRunning) return;
        
        set({ isAnnotatorRunning: true, annotatorProgress: 0, annotatorLogs: ["Starting Annotation Agent..."] });
        const log = (msg: string) => set(s => ({ annotatorLogs: [...s.annotatorLogs.slice(-5), msg] }));
        
        let processed = 0;

        while (get().isAnnotatorRunning) {
             const post = await db.dequeuePost();
             if (!post) {
                 log("Queue empty. Standing by.");
                 break;
             }

             log(`Processing: "${post.substring(0, 40)}..."`);
             
             try {
                // Execute Server Action directly
                const annotation = await runAutoAnnotatorAction(post);
                await db.addForVerification(post, annotation);
             } catch (e: any) {
                 log(`Failed: ${e.message}`);
                 console.error(e);
             }

             processed++;
             const currentTotalRemaining = get().queueCounts.curation;
             const overallProgress = (processed / (processed + currentTotalRemaining + 1)) * 100;

             set({ annotatorProgress: overallProgress });
             await get().initializeData();
             await new Promise(r => setTimeout(r, 200)); 
        }

        set({ isAnnotatorRunning: false, annotatorLogs: [...get().annotatorLogs, "Batch Complete."] });
    },

    stopAutoAnnotator: () => {
        set({ isAnnotatorRunning: false });
    },

    loadNextVerificationItem: async () => {
        set({ currentVerificationItem: null });
        const item = await db.dequeueForVerification();
        set({ currentVerificationItem: item || null });
        await get().initializeData();
    },

    submitVerification: async (finalAnnotation, wasEdited, qcFeedback) => {
        const item = get().currentVerificationItem;
        if (!item) return;

        try {
            await db.addFeedback({
                timestamp: new Date().toISOString(),
                postText: item.postText,
                originalAnnotation: item.annotation,
                correctedAnnotation: finalAnnotation,
                qcFeedback
            });
        } catch (e) {
            console.error(e);
        }

        // Update Stats
        const currentState = get().datasetState;
        const newState: DatasetState = JSON.parse(JSON.stringify(currentState));
        newState.total_annotations_processed += 1;
        
        // Simple update logic
        CLEAVAGE_IDS.forEach((cleavageId, idx) => {
             if (finalAnnotation.labels.length > idx && finalAnnotation.labels[idx] > 0.5) {
                newState.cleavages[cleavageId] = (newState.cleavages[cleavageId] || 0) + 1;
             }
        });

        finalAnnotation.tactics.forEach(tacticName => {
            const tacticId = getTacticId(tacticName);
            if (tacticId) newState.tactics[tacticId] = (newState.tactics[tacticId] || 0) + 1;
        });
        
        const emotionId = getEmotionId(finalAnnotation.emotion_fuel);
        if (emotionId) newState.emotions[emotionId] = (newState.emotions[emotionId] || 0) + 1;
        
        await db.dataset.put({ id: 'currentState', data: newState });
        set({ datasetState: newState });

        toast.success("Verified");
        await get().loadNextVerificationItem();
    },

    skipVerificationItem: async () => {
        await get().loadNextVerificationItem();
    }
}));
