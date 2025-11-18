import React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { Annotation, QCCompletionData, QcAgentResult, UiSuggestion, VerificationQueueItem } from '../types';
import { CLEAVAGE_IDS, CLEAVAGE_COLORS } from '../utils/constants';
import { getCleavageName } from '../utils/codex';
import { db } from '../lib/dexie';
import AnnotationEditor from './AnnotationEditor';

// --- FormattedPost Sub-Component ---
const FormattedPost: React.FC<{ post: string; annotation: Annotation | null }> = ({ post, annotation }) => {
  if (!annotation) return <blockquote className="post-blockquote">{post}</blockquote>;

  const { labels, tactics, emotion_fuel } = annotation;

  const activeCleavages = labels
    .map((score, index) => ({ id: CLEAVAGE_IDS[index], name: getCleavageName(CLEAVAGE_IDS[index]), score }))
    .filter(c => c.score > 0.5);

  const Badge: React.FC<{ text: string; color: string; type: string }> = ({ text, color, type }) => (
    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full mr-2 mb-1 ${color}`}>
      <span className="font-light uppercase opacity-70 mr-1">{type}:</span>
      {text}
    </span>
  );

  return (
    <div className="my-4 p-4 bg-white dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600/50 rounded-lg shadow-sm">
      <h3 className="text-lg font-medium text-slate-900 dark:text-slate-200">Post (Formatted)</h3>
      <blockquote className="mt-2 p-3 bg-slate-50 dark:bg-slate-900/30 border-l-4 border-rose-500 text-slate-700 dark:text-slate-300 italic">
        <p>"{post}"</p>
      </blockquote>
      <div className="mt-3 pt-3 border-t dark:border-slate-600">
        <h4 className="text-sm font-semibold mb-2 text-slate-700 dark:text-slate-300">Annotation Identifiers:</h4>
        {activeCleavages.length === 0 && tactics.length === 0 && (emotion_fuel === 'Apathy' || !emotion_fuel) && (
          <p className="text-xs text-slate-500 dark:text-slate-400">No strong identifiers found (Apathy/Neutral).</p>
        )}
        <div>
          {activeCleavages.map(cleavage => (
            <Badge
              key={cleavage.id}
              text={cleavage.name}
              color={CLEAVAGE_COLORS[cleavage.id] || 'bg-slate-200 dark:bg-slate-600'}
              type="Cleavage"
            />
          ))}
          {tactics.map(tacticName => (
            <Badge key={tacticName} text={tacticName} color="bg-blue-200 text-blue-900 dark:bg-blue-800 dark:text-blue-100" type="Tactic" />
          ))}
          {emotion_fuel && emotion_fuel !== 'Apathy' && (
            <Badge text={emotion_fuel} color="bg-amber-200 text-amber-900 dark:bg-amber-800 dark:text-amber-100" type="Emotion" />
          )}
        </div>
      </div>
    </div>
  );
};

// --- Main VerificationView Component ---
interface VerificationViewProps {
  onAnnotationVerified: (finalAnnotation: Annotation) => void;
  onQueueUpdate: () => void;
  onError: (error: string | null) => void;
}

const VerificationView: React.FC<VerificationViewProps> = ({ onAnnotationVerified, onQueueUpdate, onError }) => {
  const [currentItem, setCurrentItem] = useState<VerificationQueueItem | null>(null);
  const [finalAnnotation, setFinalAnnotation] = useState<Annotation | null>(null);
  const [wasEdited, setWasEdited] = useState(false);
  
  const [isQCRunning, setIsQCRunning] = useState(false);
  const [qcResult, setQcResult] = useState<QcAgentResult | null>(null);
  const [activeSuggestions, setActiveSuggestions] = useState<UiSuggestion[]>([]);

  // States for manual mode
  const [manualPostInput, setManualPostInput] = useState('');
  const [manualAnnotationInput, setManualAnnotationInput] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  const suggestionsMap = useMemo(() => {
    const map = new Map<string, UiSuggestion>();
    activeSuggestions.forEach(s => map.set(s.field_path, s));
    return map;
  }, [activeSuggestions]);
  
  const loadNextItem = async () => {
    const nextItem = await db.dequeueForVerification();
    onQueueUpdate();
    if (nextItem) {
      setCurrentItem(nextItem);
      setFinalAnnotation(JSON.parse(JSON.stringify(nextItem.annotation)));
      setWasEdited(false);
      setQcResult(null);
      setActiveSuggestions([]);
    } else {
      setCurrentItem(null);
      setFinalAnnotation(null);
    }
  };
  
  // Initial load
  useEffect(() => {
    loadNextItem();
  }, []);

  useEffect(() => {
    if (!currentItem) {
      setIsQCRunning(false);
      return;
    };

    const runQCAgent = async () => {
      setIsQCRunning(true);
      onError(null);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000); // 45-second timeout

      try {
        const response = await fetch('/api/qc-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ post: currentItem.postText, annotation: currentItem.annotation }),
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);

        if (!response.ok) {
            const status = response.status;
            let errorDetails = 'An unknown error occurred.';
            try { errorDetails = (await response.json()).details || 'Server returned an error without details.'; } catch (e) {}
            if (status === 504) throw new Error(`The QC Agent timed out on the server. This can happen on complex posts.`);
            if (status === 429) throw new Error('API rate limit exceeded. Please wait a moment and try again.');
            if (status >= 500) throw new Error(`A server error occurred (Status ${status}). Please proceed with manual review.`);
            throw new Error(`The QC Agent failed with an unexpected error: ${errorDetails}`);
        }

        const data = await response.json();
        if (!data.qcResult) throw new Error("QC Agent returned a successful but invalid response.");
        
        const result: QcAgentResult = data.qcResult;
        setQcResult(result);
        setActiveSuggestions(result.ui_suggestions || []);

      } catch (err: any) {
        clearTimeout(timeoutId);
        let errorMessage = err.message;
        if (err.name === 'AbortError') {
            errorMessage = `The request timed out after 45 seconds. Please proceed with manual verification.`;
        }
        onError(`QC Agent Failed: ${errorMessage}`);
      } finally {
        setIsQCRunning(false);
      }
    };
    runQCAgent();
  }, [currentItem, onError]); 

  const handleLoadManualData = async () => {
    try {
        const parsedAnnotation = JSON.parse(manualAnnotationInput);
        // Add to the verification queue and then load it
        await db.addForVerification(manualPostInput, parsedAnnotation);
        await loadNextItem(); // This will now pick up the item we just added
        setManualPostInput('');
        setManualAnnotationInput('');
        setJsonError(null);
    } catch(e) {
        setJsonError("Invalid JSON. Could not load for verification.");
    }
  };
  
  const handleAnnotationInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newJson = e.target.value;
    setManualAnnotationInput(newJson);
    try {
        JSON.parse(newJson);
        setJsonError(null);
    } catch (err) {
        setJsonError("Invalid JSON format.");
    }
  };

  const handleApplySuggestion = (suggestion: UiSuggestion) => {
    if (!finalAnnotation) return;
    setFinalAnnotation(prev => {
      const newAnnotation = { ...prev! };
      const { field_path, suggestion: value } = suggestion;

      if (field_path.startsWith('labels[')) {
        const index = parseInt(field_path.match(/\[(\d+)\]/)?.[1] ?? '-1');
        if (index !== -1) {
          const newLabels = [...newAnnotation.labels];
          newLabels[index] = value as number;
          newAnnotation.labels = newLabels;
        }
      } else if (field_path === 'tactics') {
        newAnnotation.tactics = value as string[];
      } else {
        (newAnnotation as any)[field_path] = value;
      }
      return newAnnotation;
    });

    setWasEdited(true);
    setActiveSuggestions(prev => prev.filter(s => s.field_path !== suggestion.field_path));
  };
  
  const handleApplyAllSuggestions = () => {
    if (!finalAnnotation) return;
    setFinalAnnotation(prev => {
      const newAnnotation = JSON.parse(JSON.stringify(prev!));
      activeSuggestions.forEach(suggestion => {
        const { field_path, suggestion: value } = suggestion;
        if (field_path.startsWith('labels[')) {
          const index = parseInt(field_path.match(/\[(\d+)\]/)?.[1] ?? '-1');
          if (index !== -1) newAnnotation.labels[index] = value;
        } else if (field_path === 'tactics') {
          newAnnotation.tactics = value as string[];
        } else {
          (newAnnotation as any)[field_path] = value;
        }
      });
      return newAnnotation;
    });

    setWasEdited(true);
    setActiveSuggestions([]);
  };

  const handleEdit = (field: keyof Annotation, value: any, fieldPath?: string) => {
    if (!finalAnnotation) return;
    setFinalAnnotation(prev => ({ ...prev!, [field]: value }));
    setWasEdited(true);
    const pathToClear = fieldPath || field;
    if (suggestionsMap.has(pathToClear)) {
        setActiveSuggestions(prev => prev.filter(s => s.field_path !== pathToClear));
    }
  };

  const handleSubmit = async () => {
    if (!finalAnnotation || !currentItem) return;
    const data: QCCompletionData = {
      finalAnnotation: finalAnnotation,
      originalAnnotation: currentItem.annotation,
      wasEdited: wasEdited,
      qcAgentFeedback: qcResult?.feedback || 'Manual review (QC Agent failed or was bypassed)'
    };

    await db.addFeedback({
        timestamp: new Date().toISOString(),
        postText: currentItem.postText,
        originalAnnotation: data.originalAnnotation,
        correctedAnnotation: data.finalAnnotation,
        qcFeedback: data.qcAgentFeedback, 
    });

    onAnnotationVerified(data.finalAnnotation);
    await loadNextItem(); // Load the next item from the queue
  };
  
  const handleBack = async () => {
    if(currentItem) {
        // Put the item back at the start of the queue (by re-adding it)
        await db.addForVerification(currentItem.postText, currentItem.annotation);
    }
    setCurrentItem(null); // Go back to manual/empty state
    onQueueUpdate(); // Update counts
  };
  
  if (!currentItem) {
    return (
        <section className="p-4 sm:p-6 border border-rose-200 dark:border-rose-500/30 rounded-lg bg-rose-50 dark:bg-rose-900/20 relative">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100">3. Verification Panel</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">The verification queue is empty. You can add an item manually below.</p>
        
        <div className="my-6 space-y-4 p-4 bg-white dark:bg-slate-700/50 border rounded-lg dark:border-slate-600/50">
            <h3 className="text-lg font-semibold">Manual Verification Entry</h3>
            <div>
                <label htmlFor="manual-post" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Post Text</label>
                <textarea id="manual-post" value={manualPostInput} onChange={(e) => setManualPostInput(e.target.value)} placeholder="Paste the post text here."
                    className="mt-1 w-full p-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md shadow-sm bg-white dark:bg-slate-800" rows={3}/>
            </div>
             <div>
                <label htmlFor="manual-annotation" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Annotation JSON</label>
                <textarea id="manual-annotation" value={manualAnnotationInput} onChange={handleAnnotationInputChange} placeholder='Paste the annotation JSON here.'
                    className={`mt-1 w-full p-2 font-mono text-xs border rounded-md shadow-sm bg-white dark:bg-slate-800 ${jsonError ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'}`} rows={8}/>
                {jsonError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{jsonError}</p>}
            </div>
             <button
                onClick={handleLoadManualData}
                disabled={!!jsonError || !manualPostInput.trim() || !manualAnnotationInput.trim()}
                className="w-full px-6 py-2 font-semibold text-white bg-rose-600 rounded-md hover:bg-rose-700 disabled:bg-rose-300 dark:disabled:bg-rose-800"
            >
                Add to Verification Queue
            </button>
        </div>
      </section>
    );
  }


  return (
    <section className="p-4 sm:p-6 border border-rose-200 dark:border-rose-500/30 rounded-lg bg-rose-50 dark:bg-rose-900/20 relative">
      <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100">3. Verification Panel (HITL)</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Review the AI-generated annotation and the QC Agent's feedback. Make final corrections and accept, or send it back.</p>

      {isQCRunning && (
        <div className="my-4 p-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-500/50 rounded-lg flex items-center">
          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-600 dark:text-blue-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
          <p className="text-sm font-medium text-blue-800 dark:text-blue-300">Running QC Agent for feedback and suggestions...</p>
        </div>
      )}

      {qcResult && !isQCRunning && (
        <div className={`my-4 p-4 rounded-lg border ${ qcResult.qc_passed ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-500/50' : 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-500/50' }`}>
          <div className="flex justify-between items-start">
            <div>
              <h3 className={`text-lg font-semibold ${ qcResult.qc_passed ? 'text-green-800 dark:text-green-200' : 'text-yellow-800 dark:text-yellow-200' }`}>{qcResult.qc_passed ? 'QC Agent: Passed' : 'QC Agent: Needs Review'}</h3>
              <p className={`mt-1 text-sm ${ qcResult.qc_passed ? 'text-green-700 dark:text-green-300' : 'text-yellow-700 dark:text-yellow-300' }`}>{qcResult.feedback}</p>
            </div>
            {activeSuggestions.length > 0 && ( <button onClick={handleApplyAllSuggestions} className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 rounded-md hover:bg-rose-700">Apply All ({activeSuggestions.length})</button> )}
          </div>
        </div>
      )}

      {finalAnnotation && <FormattedPost post={currentItem.postText} annotation={finalAnnotation} />}

      {!isQCRunning && finalAnnotation && (
        <AnnotationEditor
          annotation={finalAnnotation}
          suggestionsMap={suggestionsMap}
          onEdit={handleEdit}
          onApplySuggestion={handleApplySuggestion}
        />
      )}

      <div className="mt-6 flex flex-col sm:flex-row-reverse gap-2">
        <button onClick={handleSubmit} disabled={isQCRunning} className="w-full sm:w-auto px-6 py-2 font-semibold text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-green-400 dark:disabled:bg-green-800">Accept &amp; Finalize</button>
        <button onClick={handleBack} disabled={isQCRunning} className="w-full sm:w-auto px-4 py-2 font-semibold text-slate-700 dark:text-slate-200 bg-slate-200 dark:bg-slate-600 rounded-md hover:bg-slate-300 dark:hover:bg-slate-500">Back (Re-queue)</button>
      </div>
    </section>
  );
};

export default VerificationView;