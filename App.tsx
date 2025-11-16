
import React from 'react';
import { useState } from 'react';
import CuratorView from './components/CuratorView';
import AnnotatorView from './components/AnnotatorView';
import QCView from './components/QCView';
import CorpusView from './components/CorpusView'; // Import the new component
import { DatasetState, Annotation } from './types';
import { INITIAL_DATASET_STATE } from './utils/initialState';
import { CLEAVAGE_IDS } from './utils/constants';

type AppView = 'curator' | 'annotator' | 'qc';
type AppMode = 'pipeline' | 'corpus'; // For top-level navigation

function App() {
  const [datasetState, setDatasetState] = useState<DatasetState>(INITIAL_DATASET_STATE);
  const [currentView, setCurrentView] = useState<AppView>('curator');
  const [currentMode, setCurrentMode] = useState<AppMode>('pipeline'); // New state for navigation
  const [currentPost, setCurrentPost] = useState<string | null>(null);
  const [currentAnnotation, setCurrentAnnotation] = useState<Annotation | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Handsoff FROM QC TO Curator (FINAL STEP)
  const handleQCComplete = (finalAnnotation: Annotation) => {
    console.log('QC Complete, updating dataset state:', finalAnnotation);
    setError(null);

    setDatasetState(prevState => {
      const newState: DatasetState = JSON.parse(JSON.stringify(prevState));

      finalAnnotation.cleavages.forEach((score, index) => {
        if (score > 0.5) { // Only count significant activations
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

      return newState;
    });

    // Reset all transient state and return to Curator
    setCurrentPost(null);
    setCurrentAnnotation(null);
    setCurrentView('curator');
  };

  // Handoff FROM Curator TO Annotator
  const handlePostFound = (postText: string) => {
    console.log('Post found:', postText);
    setError(null);
    setCurrentPost(postText);
    setCurrentView('annotator');
  };
  
  // Handoff FROM Annotator TO QC
  const handleAnnotationComplete = (annotation: Annotation) => {
    console.log('Annotation received, sending to QC:', annotation);
    setError(null);
    setCurrentAnnotation(annotation);
    setCurrentView('qc');
  };

  const handleError = (errorMessage: string | null) => {
    setError(errorMessage);
  };

  const NavButton = ({ mode, children }: { mode: AppMode, children: React.ReactNode }) => (
    <button
      onClick={() => setCurrentMode(mode)}
      className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
        currentMode === mode
          ? 'bg-blue-600 text-white'
          : 'text-gray-600 hover:bg-gray-200'
      }`}
    >
      {children}
    </button>
  );

  return (
    <div className="max-w-4xl mx-auto my-8 p-4 md:p-8 font-sans bg-white shadow-lg rounded-lg">
      <header className="mb-6 border-b pb-4">
        <h1 className="text-3xl font-bold text-gray-900">Magdalenka AI Workbench</h1>
        <p className="text-gray-600 mt-1">An advanced agentic workflow for high-quality data generation and RAG.</p>
        <nav className="mt-4 flex space-x-2 bg-gray-100 p-1 rounded-lg">
          {/* FIX: Moved text content inside the NavButton components to pass them as children, resolving the 'children' prop error. */}
          <NavButton mode="pipeline">Annotation Pipeline</NavButton>
          <NavButton mode="corpus">Corpus Management (RAG)</NavButton>
        </nav>
      </header>
      
      {error && (
        <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg mb-6" role="alert">
          <strong className="font-bold">Error:</strong>
          <span className="block sm:inline ml-2">{error}</span>
        </div>
      )}

      <main className="space-y-8">
        {currentMode === 'pipeline' && (
          <>
            {currentView === 'curator' && (
              <CuratorView
                datasetState={datasetState}
                onPostFound={handlePostFound}
                onError={handleError}
              />
            )}

            {currentView === 'annotator' && currentPost && (
              <AnnotatorView
                postText={currentPost}
                onAnnotationComplete={handleAnnotationComplete}
                onError={handleError}
              />
            )}

            {currentView === 'qc' && currentPost && currentAnnotation && (
              <QCView
                postText={currentPost}
                annotation={currentAnnotation}
                onQCComplete={handleQCComplete}
                onError={handleError}
              />
            )}
          </>
        )}
        
        {currentMode === 'corpus' && (
            <CorpusView />
        )}
      </main>
    </div>
  );
}

export default App;
