
import React from 'react';
import { useState, useEffect } from 'react';
import { Annotation, QCCompletionData } from '../types';

interface QCViewProps {
  postText: string;
  annotation: Annotation;
  onQCComplete: (qcData: QCCompletionData) => void;
  onError: (error: string | null) => void;
  onBack: () => void;
}

const QCView: React.FC<QCViewProps> = ({ postText, annotation, onQCComplete, onError, onBack }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [qcResult, setQcResult] = useState<any>(null);
  const [editableAnnotation, setEditableAnnotation] = useState('');
  const [isJsonValid, setIsJsonValid] = useState(true);
  const [wasEdited, setWasEdited] = useState(false);
  
  const originalAnnotationString = JSON.stringify(annotation, null, 2);

  useEffect(() => {
    setEditableAnnotation(JSON.stringify(annotation, null, 2));
    setWasEdited(false);
    setQcResult(null);
  }, [annotation]);

  useEffect(() => {
    if (qcResult && qcResult.revised_annotation) {
      const revisedString = JSON.stringify(qcResult.revised_annotation, null, 2);
      setEditableAnnotation(revisedString);
      setWasEdited(revisedString !== originalAnnotationString);
    }
  }, [qcResult, originalAnnotationString]);

  const handleEditableAnnotationChange = (text: string) => {
    setEditableAnnotation(text);
    setWasEdited(text !== originalAnnotationString);
    try {
      JSON.parse(text);
      setIsJsonValid(true);
    } catch {
      setIsJsonValid(false);
    }
  };

  const handleQCCheck = async () => {
    setIsLoading(true);
    onError(null);
    setQcResult(null);
    try {
      const response = await fetch('/api/qc-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post: postText, annotation }),
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
    if (!isJsonValid) {
      onError('Cannot accept, the annotation contains invalid JSON.');
      return;
    }
    try {
      const finalAnnotation = JSON.parse(editableAnnotation);
      onQCComplete({
        finalAnnotation,
        originalAnnotation: annotation,
        wasEdited,
        qcAgentFeedback: qcResult?.feedback || null,
      });
    } catch (err: any) {
      onError(`Failed to parse final annotation: ${err.message}`);
    }
  };

  return (
    <section className="p-6 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50 relative">
       <button onClick={onBack} className="absolute top-4 right-4 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">&larr; Back to Annotator</button>
      <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-100">3. Quality Control (QC) Agent</h2>
      <p className="mt-2 text-gray-600 dark:text-gray-400">A third agent validates the annotation for coherence and justification. Run the QC check, make final manual edits, and accept.</p>
      
      <div className="my-6 p-4 bg-white dark:bg-gray-700/30 border rounded-lg dark:border-gray-600/50">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-200">Post:</h3>
          <blockquote className="mt-2 p-3 bg-gray-50 dark:bg-gray-900/30 border-l-4 border-gray-300 dark:border-gray-500 text-gray-700 dark:text-gray-300 italic">
            <p>"{postText}"</p>
          </blockquote>
      </div>

      <button onClick={handleQCCheck} disabled={isLoading} className="w-full px-4 py-2 mb-4 text-white bg-amber-600 rounded-md hover:bg-amber-700 disabled:bg-amber-400 dark:disabled:bg-amber-800 flex items-center justify-center transition-colors">
        {isLoading ? 'Running QC...' : 'Run QC Check'}
      </button>

      {qcResult && (
        <div className={`mb-4 p-4 rounded-lg border ${qcResult.qc_passed ? 'bg-green-100 dark:bg-green-900/30 border-green-400 dark:border-green-500/50' : 'bg-red-100 dark:bg-red-900/30 border-red-400 dark:border-red-500/50'}`}>
          <h3 className={`text-lg font-bold ${qcResult.qc_passed ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>
            QC Result: {qcResult.qc_passed ? 'PASSED' : 'FAILED'}
          </h3>
          <p className="mt-1 text-sm text-gray-700 dark:text-gray-300"><strong>Feedback:</strong> {qcResult.feedback}</p>
        </div>
      )}
      
      <div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-200">Final Annotation (Editable)</h3>
        <textarea
          value={editableAnnotation}
          onChange={(e) => handleEditableAnnotationChange(e.target.value)}
          className={`w-full p-3 mt-2 font-mono text-xs border rounded-md shadow-sm focus:ring-rose-500 focus:border-rose-500 transition bg-white dark:bg-gray-900/50 dark:text-gray-200 ${!isJsonValid ? 'border-red-500 dark:border-red-500' : 'border-red-500'}`}
          rows={15}
        />
        {!isJsonValid && <p className="text-red-600 dark:text-red-400 text-sm mt-1">Invalid JSON format.</p>}
      </div>

      <button onClick={handleAccept} disabled={!isJsonValid} className="mt-4 w-full px-4 py-3 font-semibold text-white bg-gray-800 dark:bg-gray-200 dark:text-gray-900 rounded-md hover:bg-gray-900 dark:hover:bg-white disabled:bg-gray-400 dark:disabled:bg-gray-600 transition-colors">
        Accept & Finalize Data
      </button>
    </section>
  );
};

export default QCView;
