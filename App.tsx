
import React from 'react';
import { useState, useEffect } from 'react';
import CuratorView from './components/CuratorView';
import AnnotatorView from './components/AnnotatorView';
import QCView from './components/QCView';
import CorpusView from './components/CorpusView';
import { DatasetState, Annotation, AppView, QCCompletionData, SwarmJobResult } from './types';
import { INITIAL_DATASET_STATE } from './utils/initialState';
import { CLEAVAGE_IDS } from './utils/constants';
import { db } from './lib/dexie';
import ThemeToggle from './components/ThemeToggle';
import DashboardView from './components/DashboardView';
import PolishEagleIcon from './components/PolishEagleIcon';
import PipelineStepper from './components/PipelineStepper';

function App() {
  const [datasetState, setDatasetState] = useState<DatasetState>(INITIAL_DATASET_STATE);
  const [currentView, setCurrentView] = useState<AppView>('curator');
  const [currentPost, setCurrentPost] = useState<string | null>(null);
  const [currentAnnotation, setCurrentAnnotation] = useState<Annotation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStateLoaded, setIsStateLoaded] = useState(false);
  const [annotationQueue, setAnnotationQueue] = useState<string[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);

  useEffect(() => {
    const loadState = async () => {
      try {
        const savedState = await db.dataset.get('currentState');
        if (savedState) {
          const mergedState = { ...INITIAL_DATASET_STATE, ...savedState.data };
          setDatasetState(mergedState);
        } else {
          await db.dataset.put({ id: 'currentState', data: INITIAL_DATASET_STATE });
        }
      } catch (err) {
        console.error('Failed to load state from Dexie:', err);
        setError('Failed to load saved state. Your browser may be in private mode or have IndexedDB disabled.');
      } finally {
        setIsStateLoaded(true);
      }
    };
    loadState();
  }, []);

  useEffect(() => {
    if (!isStateLoaded) return;
    const saveState = async () => {
      try {
        await db.dataset.put({ id: 'currentState', data: datasetState });
      } catch (err) {
        console.error('Failed to save state to Dexie:', err);
      }
    };
    saveState();
  }, [datasetState, isStateLoaded]);

  const handleQCComplete = async (qcData: QCCompletionData) => {
    setError(null);

    let qcFeedback = qcData.qcAgentFeedback || 'Manual user correction without QC agent run.';

    // APO: Save feedback. This is the critical loop.
    // We log feedback whether it was a manual edit OR a simple approval
    // of the QC agent's findings.
    try {
      const original = qcData.originalAnnotation;
      const final = qcData.finalAnnotation;
      
      if (qcData.wasEdited) {
        // --- Feedback from Manual Human Edit ---
        const changes: string[] = [];
        
        // A simple string comparison for arrays. For more complex objects, a deep-diff library would be better.
        if (JSON.stringify(original.cleavages) !== JSON.stringify(final.cleavages)) {
          changes.push('cleavage scores');
        }
        if (JSON.stringify([...original.tactics].sort()) !== JSON.stringify([...final.tactics].sort())) {
          changes.push('tactics');
        }
        if (original.emotion_fuel !== final.emotion_fuel) {
          changes.push('emotion fuel');
        }
        if (original.stance_label !== final.stance_label) {
          changes.push('stance');
        }
        if (original.stance_target !== final.stance_target) {
          changes.push('stance target');
        }
        if(original.text !== final.text){
          changes.push('post text');
        }
  
        const feedbackSummary = changes.length > 0
          ? `Manual user correction. Fields changed: ${changes.join(', ')}.`
          : 'Manual edit made without changing core annotation fields.';
          
        qcFeedback = feedbackSummary; // Use this more detailed feedback
      }
      // ELSE: If no edits, qcFeedback retains the QC Agent's feedback.

      // --- Log to Dexie ---
      // This now correctly logs EITHER the human edit summary OR the QC agent's original feedback.
      await db.addFeedback({
        timestamp: new Date().toISOString(),
        postText: currentPost!,
        originalAnnotation: qcData.originalAnnotation,
        correctedAnnotation: qcData.finalAnnotation,
        qcFeedback: qcFeedback, 
      });

    } catch (err) {
      console.error("Failed to save APO feedback:", err);
      // Don't block the UI for this, just log it
    }
    

    setDatasetState(prevState => {
      const newState: DatasetState = JSON.parse(JSON.stringify(prevState));
      const finalAnnotation = qcData.finalAnnotation;

      finalAnnotation.cleavages.forEach((score, index) => {
        if (score > 0.5) {
          const cleavageId = CLEAVAGE_IDS[index];
          if (cleavageId && newState.cleavages.hasOwnProperty(cleavageId)) {
            newState.cleavages[cleavageId]++;
          }
        }
      });
      
      finalAnnotation.tactics.forEach(tacticId => {
        if (newState.tactics.hasOwnProperty(tacticId)) {
          newState.tactics[tacticId]++;
        }
      });

      if (newState.emotions.hasOwnProperty(finalAnnotation.emotion_fuel)) {
        newState.emotions[finalAnnotation.emotion_fuel]++;
      }

      newState.total_annotations_processed++;

      return newState;
    });

    // Batch Processing: Check for next item in queue
    if (queueIndex < annotationQueue.length - 1) {
      const nextIndex = queueIndex + 1;
      setQueueIndex(nextIndex);
      setCurrentPost(annotationQueue[nextIndex]);
      setCurrentAnnotation(null);
      setCurrentView('annotator');
    } else {
      // End of batch
      setCurrentPost(null);
      setCurrentAnnotation(null);
      setAnnotationQueue([]);
      setQueueIndex(0);
      setCurrentView('curator');
    }
  };
  
  const handleDatasetUpload = (annotations: Annotation[]) => {
    setError(null);
    try {
        const newState = JSON.parse(JSON.stringify(INITIAL_DATASET_STATE));
        
        annotations.forEach(finalAnnotation => {
            if (!finalAnnotation || typeof finalAnnotation !== 'object') return;
            
            if (finalAnnotation.cleavages && Array.isArray(finalAnnotation.cleavages)) {
              finalAnnotation.cleavages.forEach((score, index) => {
                  if (score > 0.5) {
                      const cleavageId = CLEAVAGE_IDS[index];
                      if (cleavageId && newState.cleavages.hasOwnProperty(cleavageId)) {
                          newState.cleavages[cleavageId]++;
                      }
                  }
              });
            }
            
            if (finalAnnotation.tactics && Array.isArray(finalAnnotation.tactics)) {
                finalAnnotation.tactics.forEach(tacticId => {
                    if (tacticId && newState.tactics.hasOwnProperty(tacticId)) {
                        newState.tactics[tacticId]++;
                    }
                });
            }
            
            if (finalAnnotation.emotion_fuel && newState.emotions.hasOwnProperty(finalAnnotation.emotion_fuel)) {
                newState.emotions[finalAnnotation.emotion_fuel]++;
            }
        });

        newState.total_annotations_processed = annotations.length;
        setDatasetState(newState);
    } catch (e: any) {
        setError(`Failed to process uploaded dataset: ${e.message}`);
    }
  };

  const handlePostsFound = (result: SwarmJobResult) => {
    if (!result.finalPosts || result.finalPosts.length === 0) {
      handleError("The curator swarm returned an empty batch. Please try again.");
      return;
    }
    setError(null);
    setAnnotationQueue(result.finalPosts);
    setQueueIndex(0);
    setCurrentPost(result.finalPosts[0]);
    setCurrentAnnotation(null);
    setCurrentView('annotator');
  };
  
  const handleAnnotationComplete = (annotation: Annotation) => {
    setError(null);
    setCurrentAnnotation(annotation);
    setCurrentView('qc');
  };

  const handleError = (errorMessage: string | null) => {
    setError(errorMessage);
  };
  
  const handleCancelBatch = () => {
    setCurrentPost(null);
    setCurrentAnnotation(null);
    setAnnotationQueue([]);
    setQueueIndex(0);
    setCurrentView('curator');
  };


  type NavButtonProps = React.PropsWithChildren<{
    view: AppView;
    icon: React.ReactNode;
  }>;
  const NavButton = ({ view, icon, children }: NavButtonProps) => (
    <button
      onClick={() => {
        if (view === 'curator') {
          handleCancelBatch();
        }
        setCurrentView(view);
      }}
      className={`flex items-center justify-center space-x-2 w-full px-3 py-2 text-sm font-semibold rounded-md transition-all duration-200 ${
        currentView === view
          ? 'bg-rose-700 text-white shadow-md'
          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
      }`}
    >
      {icon}
      <span>{children}</span>
    </button>
  );

  if (!isStateLoaded) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300">
        <svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
        Loading Dataset State...
      </div>
    );
  }

  const isPipelineView = currentView === 'curator' || currentView === 'annotator' || currentView === 'qc';
  const batchProgress = annotationQueue.length > 0 ? `(Post ${queueIndex + 1} of ${annotationQueue.length})` : '';

  return (
    <div className="max-w-5xl mx-auto my-4 sm:my-8 p-4 md:p-6 font-sans bg-white dark:bg-slate-800/50 shadow-2xl shadow-slate-900/10 rounded-2xl border border-slate-200 dark:border-slate-700 relative">
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>
      <header className="mb-6 border-b border-slate-200 dark:border-slate-700 pb-6 text-center">
        <div className="flex justify-center items-center gap-4">
          <PolishEagleIcon className="w-16 h-16" />
          <div>
            <h1 className="text-3xl sm:text-4xl font-russo text-slate-900 dark:text-slate-100 tracking-wide">Magdalenka AI Committee</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm sm:text-base">An advanced agentic workflow for high-quality data generation.</p>
          </div>
        </div>
        
        <nav className="mt-6 grid grid-cols-3 gap-2 bg-slate-100 dark:bg-slate-900/50 p-2 rounded-lg max-w-lg mx-auto border dark:border-slate-700">
          <NavButton view="curator" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>}>
            Pipeline
          </NavButton>
          <NavButton view="dashboard" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}>
            Dashboard
          </NavButton>
          <NavButton view="corpus" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>}>
            Archive
          </NavButton>
        </nav>
      </header>
      
      {error && (
        <div className="p-4 bg-red-100 border border-red-400 text-red-700 dark:bg-red-900/30 dark:border-red-500/50 dark:text-red-300 rounded-lg mb-6 flex items-start space-x-3" role="alert">
           <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
           <div>
             <strong className="font-bold">Error:</strong>
             <span className="block sm:inline ml-2 whitespace-pre-wrap">{error}</span>
           </div>
        </div>
      )}

      <main className="space-y-8">
        {isPipelineView && <PipelineStepper currentStep={currentView} batchProgress={batchProgress} />}

        {currentView === 'curator' && (
          <CuratorView
            datasetState={datasetState}
            onPostsFound={handlePostsFound}
            onError={handleError}
          />
        )}
        {currentView === 'annotator' && currentPost && (
          <AnnotatorView
            postText={currentPost}
            onAnnotationComplete={handleAnnotationComplete}
            onBack={handleCancelBatch}
            onError={handleError}
          />
        )}
        {currentView === 'qc' && currentPost && currentAnnotation && (
          <QCView
            postText={currentPost}
            annotation={currentAnnotation}
            onQCComplete={handleQCComplete}
            onBack={() => {
              setCurrentAnnotation(null);
              setCurrentView('annotator');
            }}
            onError={handleError}
          />
        )}
        
        {currentView === 'dashboard' && <DashboardView datasetState={datasetState} onDatasetUpload={handleDatasetUpload} />}
        {currentView === 'corpus' && <CorpusView />}
      </main>
    </div>
  );
}

export default App;
