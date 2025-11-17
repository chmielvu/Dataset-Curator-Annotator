
import React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { Annotation, QCCompletionData, QcAgentResult, UiSuggestion } from '../types';
import { CLEAVAGE_IDS, TACTIC_IDS, EMOTION_IDS, STANCE_LABELS, CLEAVAGE_COLORS } from '../utils/constants';
import { TACTIC_ID_TO_NAME, EMOTION_ID_TO_NAME, getCleavageName } from '../utils/codex';

// --- NEW FormattedPost Sub-Component ---
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


// --- NEW Suggestion Tooltip ---
const SuggestionTooltip: React.FC<{ suggestion: UiSuggestion; onApply: (suggestion: UiSuggestion) => void; }> = ({ suggestion, onApply }) => (
  <div className="absolute z-10 -top-2 left-1/2 -translate-x-1/2 -translate-y-full w-64 bg-slate-800 text-white text-xs rounded-lg shadow-lg p-2 opacity-100 transition-opacity pointer-events-auto">
    <p className="font-bold mb-1">Agent Suggestion:</p>
    <p className="mb-2 italic">"{suggestion.rationale}"</p>
    <button
      onClick={() => onApply(suggestion)}
      className="w-full text-center px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded text-xs"
    >
      Apply Suggestion
    </button>
    <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-800"></div>
  </div>
);


// --- Main VerificationView Component ---
interface VerificationViewProps {
  postText: string;
  annotation: Annotation;
  onVerificationComplete: (data: QCCompletionData) => void;
  onBack: () => void;
  onError: (error: string | null) => void;
}

const VerificationView: React.FC<VerificationViewProps> = ({ postText, annotation, onVerificationComplete, onBack, onError }) => {
  const [finalAnnotation, setFinalAnnotation] = useState<Annotation>(() => JSON.parse(JSON.stringify(annotation)));
  const [wasEdited, setWasEdited] = useState(false);
  
  const [isQCRunning, setIsQCRunning] = useState(true);
  const [qcResult, setQcResult] = useState<QcAgentResult | null>(null);
  const [activeSuggestions, setActiveSuggestions] = useState<UiSuggestion[]>([]);

  // Memoize suggestions map for performance
  const suggestionsMap = useMemo(() => {
    const map = new Map<string, UiSuggestion>();
    activeSuggestions.forEach(s => map.set(s.field_path, s));
    return map;
  }, [activeSuggestions]);
  
  useEffect(() => {
    const runQCAgent = async () => {
      setIsQCRunning(true);
      onError(null);
      try {
        const response = await fetch('/api/qc-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ post: postText, annotation }),
        });
        
        if (!response.ok) {
            const status = response.status;
            let errorDetails = 'An unknown error occurred.';
            try {
                errorDetails = (await response.json()).details || 'Server returned an error without details.';
            } catch (e) {}
            if (status === 504) throw new Error(`The QC Agent timed out. This can happen on complex posts.`);
            if (status === 429) throw new Error('API rate limit exceeded. Please wait a moment.');
            if (status >= 500) throw new Error(`A server error occurred (Status ${status}). Please proceed with manual review.`);
            throw new Error(`The QC Agent failed with an unexpected error: ${errorDetails}`);
        }

        const data = await response.json();
        if (!data.qcResult) {
            throw new Error("QC Agent returned a successful but invalid response (missing 'qcResult').");
        }
        
        const result: QcAgentResult = data.qcResult;
        setQcResult(result);
        setActiveSuggestions(result.ui_suggestions || []);

      } catch (err: any) {
        console.error('QC Agent Error:', err);
        let finalMessage = err.message;
        if (err.message.includes('Failed to fetch')) {
            finalMessage = 'A network error occurred connecting to the QC Agent.';
        }
        onError(`QC Agent Failed: ${finalMessage} Please proceed with manual verification.`);
      } finally {
        setIsQCRunning(false);
      }
    };
    runQCAgent();
  }, [postText, annotation, onError]); 


  const handleApplySuggestion = (suggestion: UiSuggestion) => {
    setFinalAnnotation(prev => {
      const newAnnotation = { ...prev };
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
    setFinalAnnotation(prev => {
      const newAnnotation = JSON.parse(JSON.stringify(prev));
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
    setFinalAnnotation(prev => ({ ...prev, [field]: value }));
    setWasEdited(true);
    const pathToClear = fieldPath || field;
    if (suggestionsMap.has(pathToClear)) {
        setActiveSuggestions(prev => prev.filter(s => s.field_path !== pathToClear));
    }
  };

  const handleLabelChange = (index: number, value: string) => {
    const newLabels = [...finalAnnotation.labels];
    newLabels[index] = parseFloat(value);
    handleEdit('labels', newLabels, `labels[${index}]`);
  };

  const handleTacticChange = (tacticName: string) => {
    const newTactics = finalAnnotation.tactics.includes(tacticName)
      ? finalAnnotation.tactics.filter(t => t !== tacticName)
      : [...finalAnnotation.tactics, tacticName];
    handleEdit('tactics', newTactics);
  };

  const handleSubmit = () => {
    onVerificationComplete({
      finalAnnotation: finalAnnotation,
      originalAnnotation: annotation,
      wasEdited: wasEdited,
      qcAgentFeedback: qcResult?.feedback || 'Manual review (QC Agent failed or was bypassed)'
    });
  };

  const TACTIC_NAMES = useMemo(() => TACTIC_IDS.map(id => TACTIC_ID_TO_NAME.get(id) || id), []);
  const EMOTION_NAMES = useMemo(() => EMOTION_IDS.map(id => EMOTION_ID_TO_NAME.get(id) || id), []);

  return (
    <section className="p-4 sm:p-6 border border-rose-200 dark:border-rose-500/30 rounded-lg bg-rose-50 dark:bg-rose-900/20 relative">
      <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100">3. Verification Panel (HITL)</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Review the AI-generated annotation and the QC Agent's feedback. Make final corrections and accept, or send it back.</p>

      {isQCRunning && (
        <div className="my-4 p-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-500/50 rounded-lg flex items-center">
          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-600 dark:text-blue-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-sm font-medium text-blue-800 dark:text-blue-300">Running QC Agent for feedback and suggestions...</p>
        </div>
      )}

      {qcResult && !isQCRunning && (
        <div className={`my-4 p-4 rounded-lg border ${
          qcResult.qc_passed 
            ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-500/50' 
            : 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-500/50'
        }`}>
          <div className="flex justify-between items-start">
            <div>
              <h3 className={`text-lg font-semibold ${
                qcResult.qc_passed 
                  ? 'text-green-800 dark:text-green-200' 
                  : 'text-yellow-800 dark:text-yellow-200'
              }`}>
                {qcResult.qc_passed ? 'QC Agent: Passed' : 'QC Agent: Needs Review'}
              </h3>
              <p className={`mt-1 text-sm ${
                qcResult.qc_passed 
                  ? 'text-green-700 dark:text-green-300' 
                  : 'text-yellow-700 dark:text-yellow-300'
              }`}>
                {qcResult.feedback}
              </p>
            </div>
            {activeSuggestions.length > 0 && (
                <button
                    onClick={handleApplyAllSuggestions}
                    className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 rounded-md hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-rose-500 transition-colors"
                >
                    Apply All ({activeSuggestions.length})
                </button>
            )}
          </div>
        </div>
      )}

      <FormattedPost post={postText} annotation={finalAnnotation} />

      {!isQCRunning && (
        <div className="my-6 p-4 bg-white dark:bg-slate-700/50 border rounded-lg dark:border-slate-600/50 space-y-6">
          <h3 className="text-lg font-medium text-slate-900 dark:text-slate-200">Manual Annotation Editor</h3>
          
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Cleavages</label>
            {CLEAVAGE_IDS.map((id, index) => {
              const field_path = `labels[${index}]`;
              const suggestion = suggestionsMap.get(field_path);
              return (
              <div key={id} className="grid grid-cols-5 gap-2 items-center relative group">
                {suggestion && <SuggestionTooltip suggestion={suggestion} onApply={handleApplySuggestion} />}
                <label htmlFor={id} className="text-xs text-slate-600 dark:text-slate-400 col-span-2 capitalize truncate" title={getCleavageName(id)}>
                  {getCleavageName(id)}
                </label>
                <input
                  type="range" id={id} min="0" max="1" step="0.1"
                  value={finalAnnotation.labels[index]}
                  onChange={(e) => handleLabelChange(index, e.target.value)}
                  className={`w-full h-2 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer col-span-2 ${suggestion ? 'ring-2 ring-yellow-400 ring-offset-2 ring-offset-white dark:ring-offset-slate-700/50' : ''}`}
                />
                <span className="text-sm font-mono text-slate-800 dark:text-slate-200 text-right">{finalAnnotation.labels[index].toFixed(1)}</span>
              </div>
            )})}
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 relative group">
              Tactics
              {suggestionsMap.has('tactics') && <SuggestionTooltip suggestion={suggestionsMap.get('tactics')!} onApply={handleApplySuggestion} />}
            </label>
            <div className={`mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 p-2 rounded-md ${suggestionsMap.has('tactics') ? 'ring-2 ring-yellow-400' : ''}`}>
              {TACTIC_NAMES.map(tacticName => (
                <label key={tacticName} className="flex items-center space-x-2 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={finalAnnotation.tactics.includes(tacticName)}
                    onChange={() => handleTacticChange(tacticName)}
                    className="h-4 w-4 text-rose-600 border-slate-300 dark:border-slate-500 rounded focus:ring-rose-500"
                  />
                  <span className="capitalize" title={tacticName}>{tacticName}</span>
                </label>
              ))}
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
                {id: 'stance_label', label: 'Stance', options: STANCE_LABELS},
                {id: 'emotion_fuel', label: 'Emotion Fuel', options: EMOTION_NAMES},
                {id: 'stance_target', label: 'Stance Target'}
            ].map(field => {
                 const suggestion = suggestionsMap.get(field.id);
                 return (
                <div key={field.id} className="relative group">
                    {suggestion && <SuggestionTooltip suggestion={suggestion} onApply={handleApplySuggestion} />}
                    <label htmlFor={field.id} className="block text-sm font-medium text-slate-700 dark:text-slate-300">{field.label}</label>
                    {field.options ? (
                        <select
                            id={field.id}
                            value={(finalAnnotation as any)[field.id]}
                            onChange={(e) => handleEdit(field.id as keyof Annotation, e.target.value)}
                            className={`mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-rose-500 focus:border-rose-500 sm:text-sm ${suggestion ? 'ring-2 ring-yellow-400' : ''}`}
                        >
                            {field.options.map(opt => <option key={opt} value={opt} className="capitalize">{opt}</option>)}
                        </select>
                    ) : (
                        <input
                            type="text"
                            id={field.id}
                            value={(finalAnnotation as any)[field.id]}
                            onChange={(e) => handleEdit(field.id as keyof Annotation, e.target.value)}
                             className={`mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-rose-500 focus:border-rose-500 sm:text-sm ${suggestion ? 'ring-2 ring-yellow-400' : ''}`}
                        />
                    )}
                </div>
            )})}
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-col sm:flex-row-reverse gap-2">
        <button
          onClick={handleSubmit}
          disabled={isQCRunning}
          className="w-full sm:w-auto px-6 py-2 font-semibold text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors disabled:bg-green-400 dark:disabled:bg-green-800 disabled:cursor-not-allowed"
        >
          Accept &amp; Finalize
        </button>
        <button
          onClick={onBack}
          disabled={isQCRunning}
          className="w-full sm:w-auto px-4 py-2 font-semibold text-slate-700 dark:text-slate-200 bg-slate-200 dark:bg-slate-600 rounded-md hover:bg-slate-300 dark:hover:bg-slate-500 transition-colors disabled:opacity-50"
        >
          &larr; Send Back to Annotator
        </button>
      </div>
    </section>
  );
};

export default VerificationView;
