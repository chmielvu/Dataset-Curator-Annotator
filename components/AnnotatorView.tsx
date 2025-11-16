
import React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { Annotation } from '../types';

interface AnnotatorViewProps {
  postText: string;
  onAnnotationComplete: (annotation: Annotation) => void;
  onError: (error: string | null) => void;
}

const fetchJsonAsset = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
  }
  return response.json();
};

const AnnotatorView: React.FC<AnnotatorViewProps> = ({ postText, onAnnotationComplete, onError }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [codex, setCodex] = useState<any>(null);
  const [schema, setSchema] = useState<any>(null);
  const [assetsLoaded, setAssetsLoaded] = useState(false);

  const loadAssets = useCallback(async () => {
    try {
      const codexData = await fetchJsonAsset('/Magdalenka Codex Classification.json');
      const schemaData = await fetchJsonAsset('/BERT_finetuning_magdalenka_schema.json');
      setCodex(codexData);
      setSchema(schemaData);
      setAssetsLoaded(true);
    } catch (err: any) {
      onError(`Failed to load JSON assets: ${err.message}. Make sure they are in the /public folder.`);
    }
  }, [onError]);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  const handleAnnotate = async () => {
    if (!assetsLoaded) {
      onError('Assets not loaded yet.');
      return;
    }

    setIsLoading(true);
    onError(null);
    
    try {
      const response = await fetch('/api/annotator', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          post: postText,
          codex,
          schema,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `API Error: ${response.statusText}. Details: ${data.details || 'N/A'}`);
      }

      onAnnotationComplete(data.annotation as Annotation);

    // FIX: Added missing opening brace to the catch block.
    } catch (err: any) {
      console.error(err);
      onError(`Annotation failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="p-6 border border-blue-200 rounded-lg bg-blue-50">
      <h2 className="text-2xl font-semibold text-gray-800">2. Annotator Agent</h2>
      <p className="mt-2 text-gray-600">The post is ready for analysis. This agent uses an advanced reasoning model to generate a detailed annotation based on the Magdalenka Codex.</p>
      
      <div className="my-6 p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
        <h3 className="text-lg font-medium text-gray-900">Post to Annotate:</h3>
        <blockquote className="mt-2 p-3 bg-gray-50 border-l-4 border-blue-500 text-gray-700 italic">
          <p>"{postText}"</p>
        </blockquote>
      </div>

      <button 
        onClick={handleAnnotate} 
        disabled={isLoading || !assetsLoaded}
        className="w-full px-4 py-2 text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-green-300 disabled:cursor-not-allowed transition-all duration-200 ease-in-out flex items-center justify-center"
      >
        {isLoading ? (
          <>
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Annotating...
          </>
        ) : (assetsLoaded ? 'Run Annotation (Heavy Reasoning)' : 'Loading Assets...')}
      </button>
    </section>
  );
};

export default AnnotatorView;