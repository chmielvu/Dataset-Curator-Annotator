
import React from 'react';
import { useState, useEffect, useCallback } from 'react';
import CuratorView from './components/CuratorView';
import AnnotatorView from './components/AnnotatorView';
import VerificationView from './components/VerificationView';
import CorpusView from './components/CorpusView';
import { DatasetState, Annotation, AppView } from './types';
import { INITIAL_DATASET_STATE } from './utils/initialState';
import { CLEAVAGE_IDS } from './utils/constants';
import { db } from './lib/dexie';
import ThemeToggle from './components/ThemeToggle';
import DashboardView from './components/DashboardView';
import PolishEagleIcon from './components/PolishEagleIcon';
import PipelineHeader from './components/PipelineStepper';
import { getTacticId, getEmotionId } from './utils/codex';


function App() {
  const [datasetState, setDatasetState] = useState<DatasetState>(INITIAL_DATASET_STATE);
  const [currentView, setCurrentView] = useState<AppView>('curator');
  const [error, setError] = useState<string | null>(null);
  const [isStateLoaded, setIsStateLoaded] = useState(false);
  const [curationQueueCount, setCurationQueueCount] = useState(0);
  const [verificationQueueCount, setVerificationQueueCount] = useState(0);


  const updateQueueCounts = useCallback(async () => {
    try {
      const curationCount = await db.getQueueCount();
      const verificationCount = await db.getVerificationQueueCount();
      setCurationQueueCount(curationCount);
      setVerificationQueueCount(verificationCount);
    } catch (e) {
      console.error("Could not update queue counts", e);
    }
  }, []);

  useEffect(() => {
    const loadState = async () => {
      try {
        const stateLoader = async () => {
          let savedState = await db.dataset.get('currentState');
          
          const isFirstRun = !(await db.dataset.get('hasBootstrapped'));
          if (isFirstRun && !savedState) {
            console.log("First run detected. Bootstrapping from starter-dataset.json...");
            const response = await fetch('/starter-dataset.json');
            const starterAnnotations: Annotation[] = await response.json();
            const bootstrappedState = processAnnotationsToState(starterAnnotations, INITIAL_DATASET_STATE);
            await db.dataset.put({ id: 'currentState', data: bootstrappedState });
            await db.dataset.put({ id: 'hasBootstrapped', data: { value: true } as any });
            savedState = { id: 'currentState', data: bootstrappedState };
          }

          if (savedState) {
            const mergedState = { ...INITIAL_DATASET_STATE, ...savedState.data };
            setDatasetState(mergedState);
          } else {
            await db.dataset.put({ id: 'currentState', data: INITIAL_DATASET_STATE });
          }
          await updateQueueCounts();
        };
        
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Initialization timed out after 5 seconds. The local database might be locked or unresponsive.")), 5000)
        );

        await Promise.race([stateLoader(), timeoutPromise]);
        
        setIsStateLoaded(true);

      } catch (err: any) {
        console.error('Failed to load state from Dexie:', err);
        setError('Failed to load saved state. Your browser may be in private mode or have IndexedDB disabled. Error: ' + err.message);
        setIsStateLoaded(true);
      }
    };
    loadState();
  }, [updateQueueCounts]);

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
  
  const processAnnotationsToState = (annotations: Annotation[], baseState: DatasetState): DatasetState => {
      const newState = JSON.parse(JSON.stringify(baseState));
      
      annotations.forEach(finalAnnotation => {
          if (!finalAnnotation || typeof finalAnnotation !== 'object') return;
          
          if (finalAnnotation.labels && Array.isArray(finalAnnotation.labels)) {
            finalAnnotation.labels.forEach((score, index) => {
                if (score > 0.5) {
                    const cleavageId = CLEAVAGE_IDS[index];
                    if (cleavageId && newState.cleavages.hasOwnProperty(cleavageId)) {
                        newState.cleavages[cleavageId]++;
                    }
                }
            });
          }
          
          if (finalAnnotation.tactics && Array.isArray(finalAnnotation.tactics)) {
              finalAnnotation.tactics.forEach(tacticName => {
                  const tacticId = getTacticId(tacticName);
                  if (tacticId && newState.tactics.hasOwnProperty(tacticId)) {
                      newState.tactics[tacticId]++;
                  }
              });
          }
          
          if (finalAnnotation.emotion_fuel) {
              const emotionId = getEmotionId(finalAnnotation.emotion_fuel);
              if (emotionId && newState.emotions.hasOwnProperty(emotionId)) {
                  newState.emotions[emotionId]++;
              }
          }
      });

      newState.total_annotations_processed = (baseState.total_annotations_processed || 0) + annotations.length;
      return newState;
  };

  const handleAnnotationVerified = (finalAnnotation: Annotation) => {
    setDatasetState(prevState => processAnnotationsToState([finalAnnotation], prevState));
  };
  
  const handleDatasetUpload = (annotations: Annotation[]) => {
    setError(null);
    try {
        const newState = processAnnotationsToState(annotations, INITIAL_DATASET_STATE);
        newState.total_annotations_processed = annotations.length;
        setDatasetState(newState);
    } catch (e: any) {
        setError(`Failed to process uploaded dataset: ${e.message}`);
    }
  };
  
  const handleError = (errorMessage: string | null) => {
    setError(errorMessage);
  };

  const NavButton = ({ view, icon, children, count }: React.PropsWithChildren<{ view: AppView, icon: React.ReactNode, count?: number }>) => (
    <button
      onClick={() => setCurrentView(view)}
      className={`relative flex items-center justify-center space-x-2 w-full px-3 py-2 text-sm font-semibold rounded-md transition-all duration-200 ${
        currentView === view
          ? 'bg-rose-700 text-white shadow-md'
          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
      }`}
    >
      {icon}
      <span>{children}</span>
      {typeof count !== 'undefined' && count > 0 && (
        <span className="absolute -top-2 -right-2 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-rose-100 bg-rose-600 rounded-full">
            {count}
        </span>
      )}
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

  const isPipelineView = currentView === 'curator' || currentView === 'annotator' || currentView === 'verification';

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
        
        <nav className="mt-6 grid grid-cols-3 sm:grid-cols-5 gap-2 bg-slate-100 dark:bg-slate-900/50 p-2 rounded-lg max-w-2xl mx-auto border dark:border-slate-700">
          <NavButton view="curator" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>}>
            Curator
          </NavButton>
          <NavButton view="annotator" count={curationQueueCount} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" /></svg>}>
            Annotator
          </NavButton>
           <NavButton view="verification" count={verificationQueueCount} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}>
            Verifier
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
        {isPipelineView && <PipelineHeader curationQueueCount={curationQueueCount} verificationQueueCount={verificationQueueCount} />}

        {currentView === 'curator' && (
          <CuratorView
            datasetState={datasetState}
            onQueueUpdate={updateQueueCounts}
            onError={handleError}
          />
        )}
        {currentView === 'annotator' && (
          <AnnotatorView
            curationQueueCount={curationQueueCount}
            onQueuesUpdate={updateQueueCounts}
            onError={handleError}
          />
        )}
        {currentView === 'verification' && (
          <VerificationView
            onAnnotationVerified={handleAnnotationVerified}
            onQueueUpdate={updateQueueCounts}
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
