import React, { useMemo, PropsWithChildren, FC, useState } from 'react';
import { Annotation, UiSuggestion } from '../types';
import { CLEAVAGE_IDS, TACTIC_IDS, EMOTION_IDS, STANCE_LABELS } from '../utils/constants';
import { TACTIC_ID_TO_NAME, EMOTION_ID_TO_NAME, getCleavageName } from '../utils/codex';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Check, ChevronsUpDown, Search, X } from 'lucide-react';
import { cn } from '../lib/utils';

interface AnnotationEditorProps {
  annotation: Annotation;
  onEdit: (field: keyof Annotation, value: any, fieldPath?: string) => void;
  suggestionsMap: Map<string, UiSuggestion>;
  onApplySuggestion: (suggestion: UiSuggestion) => void;
}

const SuggestionWrapper: FC<PropsWithChildren<{ suggestion?: UiSuggestion, onApplySuggestion: (suggestion: UiSuggestion) => void }>> = ({ suggestion, onApplySuggestion, children }) => {
  if (!suggestion) {
    return <>{children}</>;
  }
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="relative ring-2 ring-yellow-400 rounded-md p-1 group">
            {children}
          </div>
        </TooltipTrigger>
        <TooltipContent className="w-64" side="top">
            <p className="font-bold mb-1">Agent Suggestion:</p>
            <p className="mb-2 italic">"{suggestion.rationale}"</p>
            <Button
              size="sm"
              onClick={() => onApplySuggestion(suggestion)}
              className="w-full bg-rose-600 hover:bg-rose-700"
            >
              Apply Suggestion
            </Button>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

// Searchable Single Select Component
const SearchableSelect = ({ 
  options, 
  value, 
  onChange, 
  placeholder, 
  suggestion, 
  onApplySuggestion 
}: any) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  
  const filtered = options.filter((op: string) => op.toLowerCase().includes(search.toLowerCase()));

  return (
    <SuggestionWrapper suggestion={suggestion} onApplySuggestion={onApplySuggestion}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
            {value ? <span className="truncate">{value}</span> : <span className="text-muted-foreground">{placeholder}</span>}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input 
               className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
               placeholder={`Search...`}
               value={search}
               onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="max-h-[200px] overflow-y-auto p-1">
             {filtered.length === 0 && <div className="py-6 text-center text-sm text-muted-foreground">No results found.</div>}
             {filtered.map((opt: string) => (
               <div 
                 key={opt}
                 className={cn("relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50", 
                 value === opt && "bg-accent text-accent-foreground")}
                 onClick={() => { onChange(opt); setOpen(false); }}
               >
                 <Check className={cn("mr-2 h-4 w-4", value === opt ? "opacity-100" : "opacity-0")} />
                 {opt}
               </div>
             ))}
          </div>
        </PopoverContent>
      </Popover>
    </SuggestionWrapper>
  );
};

// Searchable Multi Select Component
const SearchableMultiSelect = ({ 
    options, 
    selected, 
    onChange, 
    placeholder, 
    suggestion, 
    onApplySuggestion 
}: any) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    
    const filtered = options.filter((op: string) => op.toLowerCase().includes(search.toLowerCase()));
  
    const toggle = (opt: string) => {
        if (selected.includes(opt)) {
            onChange(selected.filter((s: string) => s !== opt));
        } else {
            onChange([...selected, opt]);
        }
    };

    return (
      <SuggestionWrapper suggestion={suggestion} onApplySuggestion={onApplySuggestion}>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between h-auto min-h-[2.5rem] py-2">
                <div className="flex flex-wrap gap-1 text-left">
                  {selected.length > 0 ? (
                      selected.map((val: string) => (
                          <div key={val} className="inline-flex items-center rounded-sm border px-1 py-0.5 text-xs font-semibold bg-secondary text-secondary-foreground" onClick={(e) => { e.stopPropagation(); toggle(val); }}>
                              {val}
                              <X className="ml-1 h-3 w-3 text-muted-foreground hover:text-foreground cursor-pointer" />
                          </div>
                      ))
                  ) : (
                      <span className="text-muted-foreground font-normal">{placeholder}</span>
                  )}
                </div>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0" align="start">
            <div className="flex items-center border-b px-3">
              <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
              <input 
                 className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                 placeholder={`Search...`}
                 value={search}
                 onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="max-h-[200px] overflow-y-auto p-1">
               {filtered.length === 0 && <div className="py-6 text-center text-sm text-muted-foreground">No results found.</div>}
               {filtered.map((opt: string) => {
                 const isSelected = selected.includes(opt);
                 return (
                 <div 
                   key={opt}
                   className={cn("relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground", isSelected && "bg-secondary")}
                   onClick={() => toggle(opt)}
                 >
                   <div className={cn("mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary", isSelected ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible")}>
                     <Check className={cn("h-4 w-4")} />
                   </div>
                   {opt}
                 </div>
               )})}
            </div>
          </PopoverContent>
        </Popover>
      </SuggestionWrapper>
    );
};

const AnnotationEditor: FC<AnnotationEditorProps> = ({ annotation, onEdit, suggestionsMap, onApplySuggestion }) => {
  const TACTIC_NAMES = useMemo(() => TACTIC_IDS.map(id => TACTIC_ID_TO_NAME.get(id) || id), []);
  const EMOTION_NAMES = useMemo(() => EMOTION_IDS.map(id => EMOTION_ID_TO_NAME.get(id) || id), []);

  const handleLabelChange = (index: number, value: string) => {
    const newLabels = [...annotation.labels];
    newLabels[index] = parseFloat(value);
    onEdit('labels', newLabels, `labels[${index}]`);
  };

  const handleTacticsChange = (newTactics: string[]) => {
    onEdit('tactics', newTactics);
  };
  
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Label>Cleavages</Label>
        {CLEAVAGE_IDS.map((id, index) => {
          const field_path = `labels[${index}]`;
          const suggestion = suggestionsMap.get(field_path);
          return (
            <SuggestionWrapper key={id} suggestion={suggestion} onApplySuggestion={onApplySuggestion}>
              <div className="grid grid-cols-5 gap-2 items-center">
                <Label htmlFor={id} className="text-xs text-muted-foreground col-span-2 capitalize truncate" title={getCleavageName(id)}>
                  {getCleavageName(id)}
                </Label>
                <Input type="range" id={id} min="0" max="1" step="0.1" value={annotation.labels[index]} onChange={(e) => handleLabelChange(index, e.target.value)} className="w-full h-2 rounded-lg appearance-none cursor-pointer col-span-2"/>
                <span className="text-sm font-mono text-foreground text-right">{annotation.labels[index].toFixed(1)}</span>
              </div>
            </SuggestionWrapper>
        )})}
      </div>
      
      <div>
        <Label className="mb-2 block">Tactics</Label>
        <SearchableMultiSelect 
          options={TACTIC_NAMES} 
          selected={annotation.tactics} 
          onChange={handleTacticsChange}
          placeholder="Select tactics..."
          suggestion={suggestionsMap.get('tactics')}
          onApplySuggestion={onApplySuggestion}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
           <SuggestionWrapper suggestion={suggestionsMap.get('stance_label')} onApplySuggestion={onApplySuggestion}>
              <Label htmlFor="stance_label">Stance</Label>
              <Select value={(annotation as any)['stance_label']} onValueChange={(value) => onEdit('stance_label', value)}>
                <SelectTrigger id="stance_label"><SelectValue placeholder="Select stance" /></SelectTrigger>
                <SelectContent>
                  {STANCE_LABELS.map(opt => <SelectItem key={opt} value={opt} className="capitalize">{opt}</SelectItem>)}
                </SelectContent>
              </Select>
           </SuggestionWrapper>
        </div>
        <div>
           <Label htmlFor="emotion_fuel" className="mb-2 block">Emotion Fuel</Label>
           <SearchableSelect 
             options={EMOTION_NAMES}
             value={(annotation as any)['emotion_fuel']}
             onChange={(value: string) => onEdit('emotion_fuel', value)}
             placeholder="Select emotion..."
             suggestion={suggestionsMap.get('emotion_fuel')}
             onApplySuggestion={onApplySuggestion}
           />
        </div>
        <div>
           <SuggestionWrapper suggestion={suggestionsMap.get('stance_target')} onApplySuggestion={onApplySuggestion}>
            <Label htmlFor="stance_target">Stance Target</Label>
            <Input type="text" id="stance_target" value={(annotation as any)['stance_target']} onChange={(e) => onEdit('stance_target', e.target.value)}/>
          </SuggestionWrapper>
        </div>
      </div>
    </div>
  );
};

export default AnnotationEditor;