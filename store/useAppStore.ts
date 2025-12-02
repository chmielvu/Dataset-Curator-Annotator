
import { create } from 'zustand';
import { DatasetState, AppView, CurationJob, SwarmJobResult, VerificationQueueItem, Annotation } from '../types';
import { INITIAL_DATASET_STATE } from '../utils/initialState';
import { toast } from 'sonner';
import { GeminiAdapter } from '../infrastructure/GeminiAdapter';
import { DexieRepository } from '../infrastructure/DexieRepository';
import { WorkflowEngine } from '../application/WorkflowEngine';

// --- DEPENDENCY INJECTION ---
const aiService = new GeminiAdapter();
const repository = new DexieRepository();
const workflowEngine = new WorkflowEngine(aiService, repository);

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
    isInitialized: boolean;
    
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
    
    // New Actions for Manual Operations
    addToCurationQueue: (postText: string) => Promise<void>;
    submitManualAnnotation: (postText: string, annotation: Annotation, qcFeedback: string) => Promise<void>;
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
    isInitialized: false,

    setView: (view) => set({ currentView: view }),
    toggleTheme: () => {
        const newTheme = get().theme === 'dark' ? 'light' : 'dark';
        set({ theme: newTheme });
        document.documentElement.classList.remove('dark', 'light');
        document.documentElement.classList.add(newTheme);
    },

    initializeData: async () => {
        try {
            const curationCount = await repository.getQueueCount();
            const verificationCount = await repository.getVerificationQueueCount();
            const stats = await repository.getDatasetState();
            set({ 
                queueCounts: { curation: curationCount, verification: verificationCount },
                datasetState: stats,
                isInitialized: true
            });
        } catch (e) {
            console.error("Init failed:", e);
            set({ isInitialized: true });
        }
    },

    addToCurationQueue: async (postText: string) => {
        await repository.enqueuePosts([postText]);
        await get().initializeData();
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
                // DELEGATE TO ENGINE
                const { result, addedCount } = await workflowEngine.runCurationBatch(i, manualQuery);

                if (addedCount > 0) {
                    log(`Batch ${i+1}: Swarm found ${addedCount} unique posts.`);
                    set(s => ({ 
                        curationJob: s.curationJob ? { ...s.curationJob, postsFound: s.curationJob.postsFound + addedCount } : null,
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
             // DELEGATE TO ENGINE
             log("Fetching next item...");
             const result = await workflowEngine.processNextAnnotationItem();
             
             if (!result.success) {
                 if (result.error === "Queue empty") {
                     log("Queue empty. Standing by.");
                     break;
                 }
                 log(`Error: ${result.error}`);
             } else {
                 log(`Annotated: "${result.post?.substring(0, 30)}..."`);
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
        const item = await repository.dequeueForVerification();
        set({ currentVerificationItem: item || null });
        await get().initializeData();
    },

    submitVerification: async (finalAnnotation, wasEdited, qcFeedback) => {
        const item = get().currentVerificationItem;
        if (!item) return;

        try {
            await workflowEngine.verifyAndLearn(item, finalAnnotation, qcFeedback);
            
            // Re-sync local state manually
            const stats = await repository.getDatasetState();
            set({ datasetState: stats });

            toast.success("Verified");
            await get().loadNextVerificationItem();
        } catch (e) {
            console.error(e);
            toast.error("Failed to save verification");
        }
    },
    
    submitManualAnnotation: async (postText, annotation, qcFeedback) => {
        try {
            await workflowEngine.submitManualAnnotation(postText, annotation, qcFeedback);
            const stats = await repository.getDatasetState();
            set({ datasetState: stats });
            toast.success("Feedback Saved");
        } catch (e) {
            console.error(e);
            toast.error("Failed to save annotation");
        }
    },

    skipVerificationItem: async () => {
        await get().loadNextVerificationItem();
    }
}));
