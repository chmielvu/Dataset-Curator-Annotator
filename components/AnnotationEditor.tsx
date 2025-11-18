
import React, { useMemo } from 'react';
import { Annotation, UiSuggestion } from '../types';
import { CLEAVAGE_IDS, TACTIC_IDS, EMOTION_IDS, STANCE_LABELS } from '../utils/constants';
import { TACTIC_ID_TO_NAME, EMOTION_ID_TO_NAME, getCleavageName } from '../utils/codex';

interface AnnotationEditorProps {
  annotation: Annotation;
  onEdit: (field: keyof Annotation, value: any, fieldPath?: string) => void;
  suggestionsMap: Map<string, UiSuggestion>;
  onApplySuggestion: (suggestion: UiSuggestion) => void;
}

// --- Suggestion Tooltip ---
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

const AnnotationEditor: React.FC<AnnotationEditorProps> = ({ annotation, onEdit, suggestionsMap, onApplySuggestion }) => {
  const TACTIC_NAMES = useMemo(() => TACTIC_IDS.map(id => TACTIC_ID_TO_NAME.get(id) || id), []);
  const EMOTION_NAMES = useMemo(() => EMOTION_IDS.map(id => EMOTION_ID_TO_NAME.get(id) || id), []);

  const handleLabelChange = (index: number, value: string) => {
    const newLabels = [...annotation.labels];
    newLabels[index] = parseFloat(value);
    onEdit('labels', newLabels, `labels[${index}]`);
  };

  const handleTacticChange = (tacticName: string) => {
    const newTactics = annotation.tactics.includes(tacticName)
      ? annotation.tactics.filter(t => t !== tacticName)
      : [...annotation.tactics, tacticName];
    onEdit('tactics', newTactics);
  };
  
  return (
    <div className="my-6 p-4 bg-white dark:bg-slate-700/50 border rounded-lg dark:border-slate-600/50 space-y-6">
      <h3 className="text-lg font-medium text-slate-900 dark:text-slate-200">Manual Annotation Editor</h3>
      <div className="space-y-3">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Cleavages</label>
        {CLEAVAGE_IDS.map((id, index) => {
          const field_path = `labels[${index}]`;
          const suggestion = suggestionsMap.get(field_path);
          return (
          <div key={id} className="grid grid-cols-5 gap-2 items-center relative group">
            {suggestion && <SuggestionTooltip suggestion={suggestion} onApply={onApplySuggestion} />}
            <label htmlFor={id} className="text-xs text-slate-600 dark:text-slate-400 col-span-2 capitalize truncate" title={getCleavageName(id)}>{getCleavageName(id)}</label>
            <input type="range" id={id} min="0" max="1" step="0.1" value={annotation.labels[index]} onChange={(e) => handleLabelChange(index, e.target.value)} className={`w-full h-2 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer col-span-2 ${suggestion ? 'ring-2 ring-yellow-400' : ''}`}/>
            <span className="text-sm font-mono text-slate-800 dark:text-slate-200 text-right">{annotation.labels[index].toFixed(1)}</span>
          </div>
        )})}
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 relative group">Tactics{suggestionsMap.has('tactics') && <SuggestionTooltip suggestion={suggestionsMap.get('tactics')!} onApply={onApplySuggestion} />}</label>
        <div className={`mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 p-2 rounded-md ${suggestionsMap.has('tactics') ? 'ring-2 ring-yellow-400' : ''}`}>
          {TACTIC_NAMES.map(tacticName => (
            <label key={tacticName} className="flex items-center space-x-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={annotation.tactics.includes(tacticName)} onChange={() => handleTacticChange(tacticName)} className="h-4 w-4 text-rose-600 border-slate-300 dark:border-slate-500 rounded focus:ring-rose-500"/>
              <span className="capitalize" title={tacticName}>{tacticName}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[{id: 'stance_label', label: 'Stance', options: STANCE_LABELS}, {id: 'emotion_fuel', label: 'Emotion Fuel', options: EMOTION_NAMES}, {id: 'stance_target', label: 'Stance Target'}].map(field => {
             const suggestion = suggestionsMap.get(field.id);
             return (
            <div key={field.id} className="relative group">
                {suggestion && <SuggestionTooltip suggestion={suggestion} onApply={onApplySuggestion} />}
                <label htmlFor={field.id} className="block text-sm font-medium text-slate-700 dark:text-slate-300">{field.label}</label>
                {field.options ? (
                    <select id={field.id} value={(annotation as any)[field.id]} onChange={(e) => onEdit(field.id as keyof Annotation, e.target.value)} className={`mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-rose-500 sm:text-sm ${suggestion ? 'ring-2 ring-yellow-400' : ''}`}>
                        {field.options.map(opt => <option key={opt} value={opt} className="capitalize">{opt}</option>)}
                    </select>
                ) : (
                    <input type="text" id={field.id} value={(annotation as any)[field.id]} onChange={(e) => onEdit(field.id as keyof Annotation, e.target.value)} className={`mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-rose-500 sm:text-sm ${suggestion ? 'ring-2 ring-yellow-400' : ''}`}/>
                )}
            </div>
        )})}
      </div>
    </div>
  );
};

export default AnnotationEditor;
