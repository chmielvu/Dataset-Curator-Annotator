
import React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { Annotation } from '../types';

interface QCViewProps {
  postText: string;
  annotation: Annotation;
  onQCComplete: (finalAnnotation: Annotation) => void;
  onError: (error: string | null) => void;
}

const fetchJsonAsset = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}`);
  }
  return response.json();
};

const QCView: React.FC<QCViewProps> = ({ postText, annotation, onQCComplete, onError }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [codex, setCodex] = useState<any>(null);
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [qcResult, setQcResult] = useState<any>(null);

  const loadAssets = useCallback(async () => {
    try {
      const codexData = await fetchJsonAsset('/Magdalenka Codex Classification.json');
      setCodex(codexData);
      setAssetsLoaded(true);
    } catch (err: any) {
      onError(`Failed to load Codex for QC: ${err.message}.`);
    }
  }, [onError]);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  const handleQCCheck = async () => {
    if (!assetsLoaded) {
      onError('Codex not loaded yet.');
      return;
    }

    setIsLoading(true);
    onError(null);
    setQcResult(null);
    
    try {
      const response = await fetch('/api/qc-agent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          post: postText,
          annotation,
          codex,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `API Error: ${response.statusText}`);
      }

      setQcResult(data.qcResult);

    } catch (err: any) {
      console.error(err);
      onError(`QC Check failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAccept = () => {
    // Use the revised annotation if it exists and QC passed, otherwise use the original
    const finalAnnotation = qcResult?.qc_passed && qcResult?.revised_annotation 
      ? qcResult.revised_annotation 
      : annotation;
    onQCComplete(finalAnnotation);
  };

  return (
    <section className="p-6 border border-green-200 rounded-lg bg-green-50">
      <h2 className="text-2xl font-semibold text-gray-800">3. Quality Control (QC) Agent</h2>
      <p className="mt-2 text-gray-600">A third agent validates the annotation for coherence and justification. Run the QC check before finalizing.</p>
      
      <div className="my-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 bg-white border rounded-lg">
          <h3 className="text-lg font-medium text-gray-900">Post:</h3>
          <blockquote className="mt-2 p-3 bg-gray-50 border-l-4 border-gray-300 text-gray-700 italic">
            <p>"{postText}"</p>
          </blockquote>
        </div>
        <div className="p-4 bg-white border rounded-lg">
          <h3 className="text-lg font-medium text-gray-900">Annotation (from Agent 2):</h3>
          <pre className="mt-2 text-xs text-gray-700 whitespace-pre-wrap bg-gray-50 p-2 rounded max-h-48 overflow-y-auto">{JSON.stringify(annotation, null, 2)}</pre>
        </div>
      </div>

      <button onClick={handleQCCheck} disabled={isLoading || !assetsLoaded} className="w-full px-4 py-2 text-white bg-purple-600 rounded-md hover:bg-purple-700 disabled:bg-purple-300 flex items-center justify-center transition-colors">
        {isLoading ? 'Running QC...' : (assetsLoaded ? 'Run QC Check' : 'Loading Codex...')}
      </button>

      {qcResult && (
        <div className={`mt-6 p-4 rounded-lg border ${qcResult.qc_passed ? 'bg-green-100 border-green-400' : 'bg-red-100 border-red-400'}`}>
          <h3 className={`text-lg font-bold ${qcResult.qc_passed ? 'text-green-800' : 'text-red-800'}`}>
            QC Result: {qcResult.qc_passed ? 'PASSED' : 'FAILED'}
          </h3>
          <p className="mt-1 text-sm text-gray-700"><strong>Feedback:</strong> {qcResult.feedback}</p>
          {qcResult.revised_annotation && (
             <div className="mt-2">
                <h4 className="font-semibold text-gray-800">Revised Annotation:</h4>
                <pre className="mt-1 text-xs text-gray-700 whitespace-pre-wrap bg-white p-2 rounded max-h-48 overflow-y-auto">{JSON.stringify(qcResult.revised_annotation, null, 2)}</pre>
             </div>
          )}
          <button onClick={handleAccept} className="mt-4 w-full px-4 py-2 text-white bg-gray-700 rounded-md hover:bg-gray-800 transition-colors">
            Accept & Finalize Data
          </button>
        </div>
      )}
    </section>
  );
};

export default QCView;
