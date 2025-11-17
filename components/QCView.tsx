import React from 'react';
import { useState, useEffect } from 'react';
import { Annotation, QCCompletionData, QcAgentResult, UiSuggestion, SliderSuggestion, MultiSelectSuggestion, TextSuggestion } from '../types';
import { CLEAVAGE_IDS, TACTIC_IDS } from '../utils/constants';

// Helper function to safely update nested properties in an object
const updateNestedField = (obj: any, path: string, value: any): any => {
    const keys = path.replace(/\[(\w+)\]/g, '.$1').split('.');
    let temp = JSON.parse(JSON.stringify(obj));
    let current = temp;
    for (let i = 0; i < keys.length - 1; i++) {
        current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
    return temp;
};

// --- Dynamic UI Control Components ---

const SliderControl: React.FC<{ suggestion: SliderSuggestion, onUpdate: (path: string, value: number) => void, currentValue: number }> = ({ suggestion, onUpdate, currentValue }) => (
    <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 capitalize">
            {suggestion.field_path.replace('cleavages[', '').replace(']', '')}: {CLEAVAGE_IDS[parseInt(suggestion.field_path.match(/\d+/)?.[0] || '0')]?.replace('cleavage_', '').replace(/_/g, ' ')}
        </label>
        <div className="flex items-center space-x-3">
            <input
                type="range"
                min={suggestion.min}
                max={suggestion.max}
                step={suggestion.step}
                value={currentValue}
                onChange={(e) => onUpdate(suggestion.field_path, parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700"
            />
            <span className="font-mono text-sm font-semibold text-slate-800 dark:text-slate-200 w-12 text-center">{currentValue.toFixed(2)}</span>
        </div>
    </div>
);

const MultiSelectControl: React.FC<{ suggestion: MultiSelectSuggestion, onUpdate: (path: string, value: string[]) => void, currentValues: string[] }> = ({ suggestion, onUpdate, currentValues }) => {
    const allOptions = TACTIC_IDS;

    const handleChange = (option: string) => {
        const newValues = currentValues.includes(option)
            ? currentValues.filter(item => item !== option)
            : [...currentValues, option];
        onUpdate(suggestion.field_path, newValues);
    };

    return (
        <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Tactics</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-2 border border-slate-300 dark:border-slate-600 rounded-md max-h-48 overflow-y-auto">
                {allOptions.map(option => (
                    <label key={option} className="flex items-center space-x-2 p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700/50 text-xs cursor-pointer">
                        <input
                            type="checkbox"
                            checked={currentValues.includes(option)}
                            onChange={() => handleChange(option)}
                            className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                        />
                        <span className="text-slate-800 dark:text-slate-200 capitalize">{option.replace('tactic_', '').replace(/_/g, ' ')}</span>
                    </label>
                ))}
            </div>
        </div>
    );
};


const TextControl: React.FC<{ suggestion: TextSuggestion, onUpdate: (path: string, value: string) => void, currentValue: string }> = ({ suggestion, onUpdate, currentValue }) => (
    <div className="space-y-1">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 capitalize">{suggestion.field_path.replace(/_/g, ' ')}</label>
        <input
            type="text"
            value={currentValue}
            onChange={(e) => onUpdate(suggestion.field_path, e.target.value)}
            className="w-full p-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:ring-rose-500 focus:border-rose-500 bg-white dark:bg-slate-800"
        />
    </div>
);


interface QCViewProps {
  postText: string;
  annotation: Annotation;
  onQCComplete: (qcData: QCCompletionData) => void;
  onError: (error: string | null) => void;
  onBack: () => void;
}

const QCView: React.FC<QCViewProps> = ({ postText, annotation, onQCComplete, onError, onBack }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [qcResult, setQcResult] = useState<QcAgentResult | null>(null);
  const [editableAnnotation, setEditableAnnotation] = useState(annotation);
  const [wasEdited, setWasEdited] = useState(false);
  const [rawJson, setRawJson] = useState(JSON.stringify(annotation, null, 2));
  const [isJsonValid, setIsJsonValid] = useState(true);

  const originalAnnotationString = JSON.stringify(annotation, null, 2);

  useEffect(() => {
    setEditableAnnotation(annotation);
    setRawJson(JSON.stringify(annotation, null, 2));
    setWasEdited(false);
    setQcResult(null);
    setIsJsonValid(true);
  }, [annotation]);
  
  // Sync raw JSON text when controls update the annotation object
  useEffect(() => {
    if (isJsonValid) {
      setRawJson(JSON.stringify(editableAnnotation, null, 2));
    }
  }, [editableAnnotation, isJsonValid]);

  const handleAnnotationUpdate = (path: string, value: any) => {
    const updatedAnnotation = updateNestedField(editableAnnotation, path, value);
    setEditableAnnotation(updatedAnnotation);
    setWasEdited(JSON.stringify(updatedAnnotation, null, 2) !== originalAnnotationString);
  };

  const handleRawJsonChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setRawJson(newText);

    try {
      const parsed = JSON.parse(newText);
      setEditableAnnotation(parsed);
      setWasEdited(JSON.stringify(parsed, null, 2) !== originalAnnotationString);
      setIsJsonValid(true);
    } catch (error) {
      setIsJsonValid(false);
      // Still consider it "edited" if the text doesn't match the original, even if invalid.
      setWasEdited(newText !== originalAnnotationString);
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
        body: JSON.stringify({ post: postText, annotation: editableAnnotation }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `API Error: ${response.statusText}`);
      }
      const result = data.qcResult as QcAgentResult;
      setQcResult(result);
      if (result.revised_annotation) {
        setEditableAnnotation(result.revised_annotation);
        setWasEdited(JSON.stringify(result.revised_annotation, null, 2) !== originalAnnotationString);
      }
    } catch (err: any) {
      console.error(err);
      onError(`QC Check failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAccept = () => {
    onQCComplete({
      finalAnnotation: editableAnnotation,
      originalAnnotation: annotation,
      wasEdited,
      qcAgentFeedback: qcResult?.feedback || null,
    });
  };

  const renderSuggestionControl = (suggestion: UiSuggestion) => {
    let currentValue: any;
    try {
        const keys = suggestion.field_path.replace(/\[(\w+)\]/g, '.$1').split('.');
        currentValue = keys.reduce((o, k) => o[k], editableAnnotation);
    } catch (e) {
        console.error("Could not get current value for path:", suggestion.field_path);
        return <p className="text-red-500 text-xs">Error rendering control for path: {suggestion.field_path}</p>;
    }

    switch (suggestion.control_type) {
        case 'slider':
            return <SliderControl suggestion={suggestion} onUpdate={handleAnnotationUpdate} currentValue={currentValue as number}/>;
        case 'multiselect':
            return <MultiSelectControl suggestion={suggestion} onUpdate={handleAnnotationUpdate} currentValues={currentValue as string[]} />;
        case 'text':
            return <TextControl suggestion={suggestion} onUpdate={handleAnnotationUpdate} currentValue={currentValue as string} />;
        default:
            return null;
    }
  };

  return (
    <section className="p-4 sm:p-6 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/50 relative">
       <button onClick={onBack} className="absolute top-4 right-4 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white">&larr; Back to Annotator</button>
      <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100">3. Quality Control (QC) Co-Pilot</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">The QC agent validates the annotation and provides interactive suggestions to guide your review.</p>
      
      <div className="my-6 p-4 bg-white dark:bg-slate-700/50 border rounded-lg dark:border-slate-600/50">
          <h3 className="text-lg font-medium text-slate-900 dark:text-slate-200">Post:</h3>
          <blockquote className="mt-2 p-3 bg-slate-50 dark:bg-slate-900/30 border-l-4 border-slate-300 dark:border-slate-500 text-slate-700 dark:text-slate-300 italic">
            <p>"{postText}"</p>
          </blockquote>
      </div>

      <button onClick={handleQCCheck} disabled={isLoading} className="w-full px-4 py-2 mb-4 font-semibold text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:bg-indigo-400 dark:disabled:bg-indigo-800 flex items-center justify-center transition-colors shadow-lg shadow-indigo-500/10 hover:shadow-xl hover:shadow-indigo-500/20">
        {isLoading ? (
            <><svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            Running QC Agent...</>
        ) : 'Run QC Agent'}
      </button>

      {qcResult && (
        <div className="space-y-4 mb-6">
          <div className={`p-4 rounded-lg border flex items-start space-x-3 ${qcResult.qc_passed ? 'bg-green-100 dark:bg-green-900/30 border-green-400 dark:border-green-500/50' : 'bg-red-100 dark:bg-red-900/30 border-red-400 dark:border-red-500/50'}`}>
            <div className="flex-shrink-0">
               {qcResult.qc_passed ? 
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-600 dark:text-green-300" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg> :
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-600 dark:text-red-300" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
               }
            </div>
            <div>
              <h3 className={`text-lg font-bold ${qcResult.qc_passed ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>
                QC Result: {qcResult.qc_passed ? 'PASSED' : 'FAILED'}
              </h3>
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-300"><strong>Feedback:</strong> {qcResult.feedback}</p>
            </div>
          </div>

          {qcResult.ui_suggestions && qcResult.ui_suggestions.length > 0 && (
            <div className="p-4 bg-white dark:bg-slate-900/30 rounded-lg border dark:border-slate-700/50">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-200 mb-3">Agent Suggestions</h3>
                <div className="space-y-4">
                    {qcResult.ui_suggestions.map((suggestion, index) => (
                        <div key={index} className="p-3 border-l-4 border-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-r-lg">
                            <p className="text-xs italic text-amber-800 dark:text-amber-300 mb-2">
                                <strong>Rationale:</strong> {suggestion.rationale}
                            </p>
                            {renderSuggestionControl(suggestion)}
                        </div>
                    ))}
                </div>
            </div>
          )}
        </div>
      )}
      
      <div>
        <details className="group" open>
            <summary className="cursor-pointer list-none flex items-center justify-between p-2 bg-slate-100 dark:bg-slate-700/50 rounded-t-lg border-b dark:border-b-white dark:border-b-black">
                <h3 className="text-lg font-medium text-slate-900 dark:text-slate-200">Final Annotation (Editable)</h3>
                 <span className="text-sm text-slate-500 dark:text-slate-400 group-hover:text-black dark:group-hover:text-white">
                    <span className="group-open:hidden">Show Raw JSON</span>
                    <span className="hidden group-open:inline">Hide Raw JSON</span>
                </span>
            </summary>
            <textarea
              value={rawJson}
              onChange={handleRawJsonChange}
              className={`w-full p-3 font-mono text-xs border rounded-b-md shadow-sm transition bg-white dark:bg-slate-900/50 dark:text-slate-200 ${
                !isJsonValid 
                  ? 'border-red-500 focus:ring-red-500 focus:border-red-500' 
                  : 'border-slate-300 dark:border-slate-600 focus:ring-rose-500 focus:border-rose-500'
              }`}
              rows={15}
            />
             {!isJsonValid && <p className="text-xs text-red-600 dark:text-red-400 mt-1">The JSON is not valid. Please correct it before finalizing.</p>}
        </details>
      </div>

      <button 
        onClick={handleAccept} 
        disabled={!isJsonValid}
        className="mt-4 w-full px-4 py-3 font-semibold text-white bg-slate-800 dark:bg-slate-200 dark:text-slate-900 rounded-md hover:bg-slate-900 dark:hover:bg-white disabled:bg-slate-400 dark:disabled:bg-slate-600 dark:disabled:cursor-not-allowed transition-colors"
      >
        Accept & Finalize Data
      </button>
    </section>
  );
};

export default QCView;