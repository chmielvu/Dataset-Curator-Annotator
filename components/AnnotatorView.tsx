
import React from 'react';
import { useState } from 'react';
import { Annotation } from '../types';
import { db } from '../lib/dexie';

interface AnnotatorViewProps {
  postText: string;
  onAnnotationComplete: (annotation: Annotation) => void;
  onError: (error: string | null) => void;
  onBack: () => void;
}

const AnnotatorView: React.FC<AnnotatorViewProps> = ({ postText, onAnnotationComplete, onError, onBack }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [completedAnnotation, setCompletedAnnotation] = useState<Annotation | null>(null);

  const handleAnnotate = async () => {
    setIsLoading(true);
    onError(null);
    setCompletedAnnotation(null);
    
    let recentFeedback = [];
    try {
        recentFeedback = await db.getRecentFeedback(5);
    } catch (err) {
        console.warn("Could not fetch APO feedback:", err);
    }
    
    try {
      const response = await fetch('/api/annotator', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ post: postText, apoFeedback: recentFeedback }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `API Error: ${response.statusText}. Details: ${data.details || 'N/A'}`);
      }
      setCompletedAnnotation(data.annotation as Annotation);

    } catch (err: any) {
      console.error(err);
      onError(`Annotation failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleProceedToQC = () => {
    if (completedAnnotation) {
      onAnnotationComplete(completedAnnotation);
    }
  };
  
  const confidenceScore = completedAnnotation 
    ? (completedAnnotation.confidence ?? Math.max(...(completedAnnotation.cleavages || [0]))) 
    : 0;

  if (completedAnnotation) {
    return (
      <section className="p-6 border border-rose-200 dark:border-rose-500/30 rounded-lg bg-rose-50 dark:bg-rose-900/20 relative">
        <button onClick={onBack} className="absolute top-4 right-4 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Cancel Batch &larr;</button>
        <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">2. Annotation Complete</h2>
        <p className="mt-2 text-gray-600 dark:text-gray-400">The agent has generated an annotation. Review the summary below before proceeding to a full Quality Control check.</p>

        <div className="my-6 p-4 bg-white dark:bg-gray-700/30 border border-gray-200 dark:border-gray-600/50 rounded-lg shadow-sm">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-200">Post:</h3>
          <blockquote className="mt-2 p-3 bg-gray-50 dark:bg-gray-900/30 border-l-4 border-rose-500 text-gray-700 dark:text-gray-300 italic">
            <p>"{postText}"</p>
          </blockquote>
        </div>

        <div className="my-6 p-4 bg-white dark:bg-gray-700/30 border rounded-lg dark:border-gray-600/50 space-y-3">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-200">Annotation Summary:</h3>
          <div className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-900/30 rounded-md">
            <span className="font-semibold text-gray-700 dark:text-gray-300">Confidence Score:</span>
            <span className="font-mono text-lg font-bold text-rose-600 dark:text-rose-400">{(confidenceScore * 100).toFixed(1)}%</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Confidence is based on the maximum cleavage activation score.</p>
          <div>
            <details>
              <summary className="cursor-pointer text-sm text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white">View Raw Annotation</summary>
              <pre className="mt-2 text-xs bg-gray-100 dark:bg-gray-800 p-3 rounded-md overflow-x-auto">
                {JSON.stringify(completedAnnotation, null, 2)}
              </pre>
            </details>
          </div>
        </div>

        <div className="flex space-x-2">
          <button 
            onClick={() => setCompletedAnnotation(null)} 
            className="w-full px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-200 dark:bg-gray-600 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
          >
            Re-run Annotation
          </button>
          <button 
            onClick={handleProceedToQC} 
            className="w-full px-4 py-2 text-white bg-rose-700 rounded-md hover:bg-rose-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-rose-500 transition-colors"
          >
            Proceed to QC &rarr;
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="p-6 border border-rose-200 dark:border-rose-500/30 rounded-lg bg-rose-50 dark:bg-rose-900/20 relative">
      <button onClick={onBack} className="absolute top-4 right-4 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Cancel Batch &larr;</button>
      <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">2. Annotator Agent</h2>
      <p className="mt-2 text-gray-600 dark:text-gray-400">The post is ready for analysis. This agent uses an advanced reasoning model to generate a detailed annotation based on the Magdalenka Codex.</p>
      
      <div className="my-6 p-4 bg-white dark:bg-gray-700/30 border border-gray-200 dark:border-gray-600/50 rounded-lg shadow-sm">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-200">Post to Annotate:</h3>
        <blockquote className="mt-2 p-3 bg-gray-50 dark:bg-gray-900/30 border-l-4 border-rose-500 text-gray-700 dark:text-gray-300 italic">
          <p>"{postText}"</p>
        </blockquote>
      </div>

      <button 
        onClick={handleAnnotate} 
        disabled={isLoading}
        className="w-full px-4 py-2 text-white bg-rose-700 rounded-md hover:bg-rose-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-rose-500 disabled:bg-rose-500 dark:disabled:bg-rose-900 disabled:cursor-not-allowed transition-all duration-200 ease-in-out flex items-center justify-center"
      >
        {isLoading ? (
          <>
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Annotating...
          </>
        ) : 'Run Annotation (Heavy Reasoning)'}
      </button>
    </section>
  );
};

export default AnnotatorView;
