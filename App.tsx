
import React from 'react';
import { useState } from 'react';
import CuratorView from './components/CuratorView';
import AnnotatorView from './components/AnnotatorView';
import QCView from './components/QCView';
import { DatasetState, Annotation } from './types';
import { INITIAL_DATASET_STATE } from './utils/initialState';
import { CLEAVAGE_IDS } from './utils/constants';

type AppView = 'curator' | 'annotator' | 'qc';

function App() {
  const [datasetState, setDatasetState] = useState<DatasetState>(INITIAL_DATASET_STATE);
  const [currentView, setCurrentView] = useState<AppView>('curator');
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

  return (
    <div className="max-w-4xl mx-auto my-8 p-4 md:p-8 font-sans bg-white shadow-lg rounded-lg">
      <header className="mb-6 border-b pb-4">
        <h1 className="text-3xl font-bold text-gray-900">Magdalenka 3-Agent Pipeline</h1>
        <p className="text-gray-600 mt-1">An advanced agentic workflow for high-quality data annotation.</p>
      </header>
      
      {error && (
        <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg mb-6" role="alert">
          <strong className="font-bold">Error:</strong>
          <span className="block sm:inline ml-2">{error}</span>
        </div>
      )}

      <main className="space-y-8">
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
      </main>
    </div>
  );
}

export default App;
