
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

    // APO: Save feedback if edited, now with detailed change summary
    if (qcData.wasEdited) {
      try {
        const original = qcData.originalAnnotation;
        const final = qcData.finalAnnotation;
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
  
        await db.addFeedback({
          timestamp: new Date().toISOString(),
          postText: currentPost!,
          originalAnnotation: qcData.originalAnnotation,
          correctedAnnotation: qcData.finalAnnotation,
          qcFeedback: qcFeedback, // Save detailed feedback
        });
      } catch (err) {
        console.error("Failed to save APO feedback:", err);
        // Don't block the UI for this, just log it
      }
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
  }>;
  const NavButton = ({ view, children }: NavButtonProps) => (
    <button
      onClick={() => {
        if (view === 'curator') {
          handleCancelBatch();
        }
        setCurrentView(view);
      }}
      className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
        currentView === view
          ? 'bg-rose-700 text-white'
          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
      }`}
    >
      {children}
    </button>
  );

  if (!isStateLoaded) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-300">
        Loading Dataset State...
      </div>
    );
  }

  const isPipelineView = currentView === 'curator' || currentView === 'annotator' || currentView === 'qc';
  const batchProgress = annotationQueue.length > 0 ? `(Post ${queueIndex + 1} of ${annotationQueue.length})` : '';

  return (
    <div className="max-w-4xl mx-auto my-8 p-4 md:p-8 font-sans bg-white dark:bg-gray-800 shadow-2xl rounded-xl border border-gray-200 dark:border-gray-700 relative">
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>
      <header className="mb-6 border-b border-gray-200 dark:border-gray-700 pb-4 text-center">
        <div className="flex justify-center">
          <PolishEagleIcon className="w-20 h-20" />
        </div>
        <h1 className="text-4xl font-russo text-gray-900 dark:text-gray-100 mt-2 tracking-wide">Magdalenka AI Committee</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">An advanced agentic workflow for high-quality data generation.</p>
        
        <nav className="mt-6 flex justify-center space-x-2 bg-gray-100 dark:bg-gray-900 p-1 rounded-lg max-w-md mx-auto">
          <NavButton view="curator">Annotation Pipeline</NavButton>
          <NavButton view="dashboard">Dashboard</NavButton>
          <NavButton view="corpus">Corpus Management (RAG)</NavButton>
        </nav>
      </header>
      
      {error && (
        <div className="p-4 bg-red-100 border border-red-400 text-red-700 dark:bg-red-900/20 dark:border-red-500/50 dark:text-red-300 rounded-lg mb-6" role="alert">
          <strong className="font-bold">Error:</strong>
          <span className="block sm:inline ml-2 whitespace-pre-wrap">{error}</span>
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
