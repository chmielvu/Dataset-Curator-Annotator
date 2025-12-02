
import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import AnnotationEditor from './AnnotationEditor';
import { Terminal, Cpu, StopCircle, Play, Save, RefreshCw, PenTool, ClipboardList, ShieldCheck, AlertTriangle, CheckCircle2, XCircle, ChevronRight, Bug } from 'lucide-react';
import { db } from '../lib/dexie';
import { toast } from 'sonner';
import { Annotation, DatasetState, UiSuggestion } from '../types';
import { getTacticId, getEmotionId } from '../utils/codex';
import { CLEAVAGE_IDS } from '../utils/constants';
import { INITIAL_DATASET_STATE } from '../utils/initialState';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog";
import { cn } from '../lib/utils';
import { ZodError } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import { GeminiAdapter } from '../infrastructure/GeminiAdapter';

// Instantiate Adapter for single-shot checks
const aiService = new GeminiAdapter();

export default function AnnotatorView() {
    const { isAnnotatorRunning, annotatorProgress, annotatorLogs, startAutoAnnotator, stopAutoAnnotator, queueCounts, initializeData } = useAppStore();

    // Workbench State
    const [queueItems, setQueueItems] = useState<string[]>([]);
    const [workbenchText, setWorkbenchText] = useState('');
    const [workbenchAnnotation, setWorkbenchAnnotation] = useState<Annotation | null>(null);
    const [isThinking, setIsThinking] = useState(false);
    const [agentError, setAgentError] = useState<{
        agentName: string;
        title: string; 
        message: string; 
        details?: string; 
        timestamp: string
    } | null>(null);

    // QC State
    const [isQcRunning, setIsQcRunning] = useState(false);
    const [qcFeedback, setQcFeedback] = useState<{passed: boolean, message: string} | null>(null);
    const [qcSuggestions, setQcSuggestions] = useState<Map<string, UiSuggestion>>(new Map());

    // Load queue preview
    useEffect(() => {
        const loadQueue = async () => {
            const items = await db.curationQueue.orderBy('id').limit(10).toArray();
            setQueueItems(items.map(i => i.postText));
        };
        loadQueue();
    }, [queueCounts.curation]);

    // Reset QC and Errors when new annotation is loaded
    useEffect(() => {
        setQcFeedback(null);
        setQcSuggestions(new Map());
        setAgentError(null);
    }, [workbenchAnnotation, workbenchText]);

    const handleRunWorkbench = async () => {
        if (!workbenchText.trim()) return;
        setIsThinking(true);
        setWorkbenchAnnotation(null);
        setAgentError(null);
        try {
            const result = await aiService.runAutoAnnotator(workbenchText);
            setWorkbenchAnnotation(result);
        } catch (e: any) {
            let errorTitle = "Analysis Failed";
            let errorMessage = e.message;
            let errorDetails = e.stack || JSON.stringify(e, null, 2);

            if (e instanceof ZodError) {
                errorTitle = "Validation Error";
                errorMessage = "The agent output did not match the strict schema requirements.";
                errorDetails = JSON.stringify(e.issues, null, 2);
            }

            setAgentError({ 
                agentName: "Auto-Annotator (Gemini 2.5 Flash)",
                title: errorTitle, 
                message: errorMessage, 
                details: errorDetails,
                timestamp: new Date().toLocaleTimeString()
            });
            toast.error(errorTitle);
        } finally {
            setIsThinking(false);
        }
    };

    const handleRunQC = async () => {
        if (!workbenchAnnotation || !workbenchText) return;
        setIsQcRunning(true);
        setAgentError(null);
        try {
            const result = await aiService.runQCCheck(workbenchText, workbenchAnnotation);
            
            setQcFeedback({
                passed: result.qc_passed,
                message: result.feedback
            });

            const newSuggestions = new Map<string, UiSuggestion>();
            result.ui_suggestions.forEach(s => newSuggestions.set(s.field_path, s));
            setQcSuggestions(newSuggestions);

            if (result.qc_passed) {
                toast.success("QC Passed", { description: "Gemini 3 Pro approves this annotation." });
            } else {
                toast.warning("QC Issues Found", { description: "Review suggestions in the editor." });
            }
        } catch (e: any) {
            let errorTitle = "QC Failed";
            let errorMessage = e.message;
            let errorDetails = e.stack || JSON.stringify(e, null, 2);

             if (e instanceof ZodError) {
                errorTitle = "Validation Error";
                errorMessage = "QC Agent output invalid.";
                errorDetails = JSON.stringify(e.issues, null, 2);
            }
            
            setAgentError({ 
                agentName: "QC Supervisor (Gemini 3 Pro)",
                title: errorTitle, 
                message: errorMessage,
                details: errorDetails,
                timestamp: new Date().toLocaleTimeString()
            });
        } finally {
            setIsQcRunning(false);
        }
    };

    const handleApplySuggestion = (suggestion: UiSuggestion) => {
        if (!workbenchAnnotation) return;
        
        let newValue = suggestion.suggestion;
        let field = suggestion.field_path;
        
        const match = field.match(/labels\[(\d+)\]/);
        
        if (match) {
            const index = parseInt(match[1]);
            const newLabels = [...workbenchAnnotation.labels];
            newLabels[index] = newValue as number;
            handleEditAnnotation('labels', newLabels);
            toast.success("Applied Suggestion", { description: `Updated cleavage score.` });
        } else {
             handleEditAnnotation(field as keyof Annotation, newValue);
             toast.success("Applied Suggestion", { description: `Updated ${field.replace('_', ' ')}.` });
        }
        
        const nextSuggestions = new Map(qcSuggestions);
        nextSuggestions.delete(suggestion.field_path);
        setQcSuggestions(nextSuggestions);
    };

    const handleSaveWorkbench = async () => {
        if (!workbenchAnnotation || !workbenchText) return;

        try {
            await db.addFeedback({
                timestamp: new Date().toISOString(),
                postText: workbenchText,
                originalAnnotation: workbenchAnnotation,
                correctedAnnotation: workbenchAnnotation,
                qcFeedback: qcFeedback ? qcFeedback.message : "Manual Workbench Correction (No QC)"
            });

            const statsEntry = await db.dataset.get('currentState');
            const newState: DatasetState = statsEntry ? statsEntry.data : JSON.parse(JSON.stringify(INITIAL_DATASET_STATE));
            
            newState.total_annotations_processed += 1;
            
            CLEAVAGE_IDS.forEach((cleavageId, idx) => {
                 if (workbenchAnnotation.labels.length > idx && workbenchAnnotation.labels[idx] > 0.5) {
                    newState.cleavages[cleavageId] = (newState.cleavages[cleavageId] || 0) + 1;
                 }
            });

            workbenchAnnotation.tactics.forEach(tacticName => {
                const tacticId = getTacticId(tacticName);
                if (tacticId) newState.tactics[tacticId] = (newState.tactics[tacticId] || 0) + 1;
            });
            
            const emotionId = getEmotionId(workbenchAnnotation.emotion_fuel);
            if (emotionId) newState.emotions[emotionId] = (newState.emotions[emotionId] || 0) + 1;
            
            await db.dataset.put({ id: 'currentState', data: newState });

            const itemInQueue = await db.curationQueue.where('postText').equals(workbenchText).first();
            if (itemInQueue && itemInQueue.id) {
                await db.curationQueue.delete(itemInQueue.id);
            }

            toast.success("Feedback Saved", { description: "Dataset statistics updated." });
            setWorkbenchAnnotation(null);
            setWorkbenchText('');
            setQcFeedback(null);
            setQcSuggestions(new Map());
            setAgentError(null);
            await initializeData();

        } catch (e: any) {
            toast.error("Save Failed", { description: e.message });
        }
    };

    const handleEditAnnotation = (field: keyof Annotation, value: any) => {
        setWorkbenchAnnotation(prev => prev ? ({ ...prev, [field]: value }) : null);
    };

    return (
        <div className="space-y-6">
             <div>
                <h2 className="text-3xl font-bold tracking-tight">Auto-Annotator</h2>
                <p className="text-muted-foreground">High-throughput analysis using Gemini 2.5 Flash.</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card className="md:col-span-1 border-primary/20 bg-primary/5">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Cpu className="h-5 w-5" /> Batch Processor
                        </CardTitle>
                        <CardDescription>{queueCounts.curation} items waiting in queue.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs">
                                <span>Progress</span>
                                <span>{annotatorProgress.toFixed(0)}%</span>
                            </div>
                            <Progress value={annotatorProgress} />
                        </div>
                        
                        {isAnnotatorRunning ? (
                             <Button variant="destructive" className="w-full" onClick={stopAutoAnnotator}>
                                <StopCircle className="mr-2 h-4 w-4"/> Stop Agent
                             </Button>
                        ) : (
                             <Button className="w-full" onClick={startAutoAnnotator} disabled={queueCounts.curation === 0}>
                                <Terminal className="mr-2 h-4 w-4"/> Start Annotation Batch
                             </Button>
                        )}
                    </CardContent>
                </Card>

                <Card className="md:col-span-1 bg-black text-green-500 font-mono text-sm border-zinc-800 shadow-2xl">
                    <CardHeader className="border-b border-zinc-800 py-3">
                        <CardTitle className="text-xs uppercase tracking-widest text-zinc-500">Agent Terminal Output</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 h-[200px] overflow-y-auto flex flex-col-reverse">
                         {annotatorLogs.length === 0 && <span className="opacity-50">_waiting for input...</span>}
                         {annotatorLogs.map((log, i) => (
                             <div key={i} className="mb-1 break-words">
                                <span className="text-zinc-600 mr-2">{`>`}</span>
                                {log}
                             </div>
                         ))}
                    </CardContent>
                </Card>
            </div>

            <Card className="border-t-4 border-t-purple-500 shadow-lg">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-xl">
                        <PenTool className="h-5 w-5 text-purple-500" />
                        Interactive Workbench
                    </CardTitle>
                    <CardDescription>
                        Manually select posts to test the Agent. Use the <strong>QC Supervisor</strong> (Gemini 3 Pro) for reasoning checks.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid lg:grid-cols-3 gap-6">
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                                <ClipboardList className="h-4 w-4" />
                                Queue Preview
                            </div>
                            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                                {queueItems.length === 0 && (
                                    <div className="text-sm text-muted-foreground italic border border-dashed p-4 rounded text-center">
                                        Queue is empty.
                                    </div>
                                )}
                                <AnimatePresence>
                                {queueItems.map((text, i) => (
                                    <motion.div 
                                        key={text + i} 
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -10 }}
                                        onClick={() => { setWorkbenchText(text); setWorkbenchAnnotation(null); }}
                                        className="p-3 bg-muted/40 hover:bg-muted cursor-pointer rounded-md text-xs line-clamp-4 border border-transparent hover:border-primary/50 transition-all active:scale-95"
                                    >
                                        {text}
                                    </motion.div>
                                ))}
                                </AnimatePresence>
                            </div>
                        </div>

                        <div className="lg:col-span-2 space-y-4">
                            <Textarea 
                                value={workbenchText}
                                onChange={(e) => setWorkbenchText(e.target.value)}
                                placeholder="Select a post from the left or paste text here..."
                                className="min-h-[120px] font-serif text-lg leading-relaxed bg-background/50 resize-y"
                            />

                            <AnimatePresence>
                            {agentError && (
                                <motion.div
                                    initial={{ opacity: 0, y: -20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                >
                                    <Alert variant="destructive" className="bg-destructive/10 border-destructive/50 text-destructive shadow-sm">
                                        <XCircle className="h-4 w-4 mt-1" />
                                        <div className="flex-1 space-y-2">
                                            <div className="flex items-center justify-between border-b border-destructive/20 pb-2 mb-2">
                                                <div className="flex items-center gap-2">
                                                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-5 font-mono uppercase tracking-wider">
                                                        {agentError.agentName}
                                                    </Badge>
                                                    <AlertTitle className="mb-0 font-semibold text-sm">
                                                        {agentError.title}
                                                    </AlertTitle>
                                                </div>
                                                <span className="text-[10px] font-mono opacity-70 bg-background/40 px-1.5 py-0.5 rounded flex items-center gap-1">
                                                    {agentError.timestamp}
                                                </span>
                                            </div>
                                            
                                            <AlertDescription className="text-sm opacity-90 leading-relaxed">
                                                {agentError.message}
                                            </AlertDescription>
                                            
                                            {agentError.details && (
                                                <div className="pt-2">
                                                     <details className="group">
                                                        <summary className="flex items-center gap-1 text-xs cursor-pointer hover:text-destructive/80 opacity-80 select-none w-fit transition-colors">
                                                            <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
                                                            <Bug className="h-3 w-3" />
                                                            Debug Logs
                                                        </summary>
                                                        <div className="mt-2 relative">
                                                            <div className="absolute top-2 right-2 text-[9px] opacity-50 font-mono">JSON</div>
                                                            <pre className="text-[10px] bg-black/5 dark:bg-black/40 p-3 rounded-md overflow-x-auto font-mono whitespace-pre-wrap border border-destructive/20 text-destructive/90 shadow-inner max-h-[200px]">
                                                                {agentError.details}
                                                            </pre>
                                                        </div>
                                                     </details>
                                                </div>
                                            )}
                                        </div>
                                    </Alert>
                                </motion.div>
                            )}
                            </AnimatePresence>
                            
                            {!workbenchAnnotation ? (
                                <Button 
                                    onClick={handleRunWorkbench} 
                                    disabled={!workbenchText || isThinking} 
                                    className="w-full h-12 text-base"
                                >
                                    {isThinking ? (
                                        <>
                                            <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
                                            Analysing...
                                        </>
                                    ) : (
                                        <>
                                            <Play className="mr-2 h-5 w-5" />
                                            Run Annotator (Gemini 2.5)
                                        </>
                                    )}
                                </Button>
                            ) : (
                                <motion.div 
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="space-y-4 border rounded-xl p-6 bg-muted/10"
                                >
                                    <div className="flex justify-between items-center border-b pb-4">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h4 className="font-semibold text-lg">Agent Result</h4>
                                                {workbenchAnnotation.confidence !== undefined && (
                                                    <Badge variant={workbenchAnnotation.confidence > 0.8 ? "default" : "secondary"}>
                                                        {(workbenchAnnotation.confidence * 100).toFixed(0)}% Confidence
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="text-xs text-muted-foreground">Verify and correct below</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button variant="outline" size="sm" onClick={handleRunQC} disabled={isQcRunning} className={qcFeedback ? (qcFeedback.passed ? "border-green-500 text-green-600" : "border-amber-500 text-amber-600") : ""}>
                                                {isQcRunning ? <RefreshCw className="mr-2 h-4 w-4 animate-spin"/> : <ShieldCheck className="mr-2 h-4 w-4"/>}
                                                {isQcRunning ? "Reasoning..." : (qcFeedback ? (qcFeedback.passed ? "QC Passed" : "Issues Found") : "Run QC Check (Gemini 3)")}
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={() => { setWorkbenchAnnotation(null); setQcFeedback(null); setAgentError(null); }}>
                                                Reset
                                            </Button>
                                        </div>
                                    </div>

                                    <AnimatePresence>
                                    {qcFeedback && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                        >
                                            <Alert variant={qcFeedback.passed ? "default" : "destructive"} className={qcFeedback.passed ? "border-green-500 bg-green-500/10 mb-4" : "border-amber-500 bg-amber-500/10 mb-4"}>
                                                {qcFeedback.passed ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
                                                <AlertTitle className={qcFeedback.passed ? "text-green-800 dark:text-green-300" : "text-amber-800 dark:text-amber-300"}>
                                                    {qcFeedback.passed ? "Quality Control Passed" : "Attention Needed"}
                                                </AlertTitle>
                                                <AlertDescription className={qcFeedback.passed ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"}>
                                                    {qcFeedback.message}
                                                </AlertDescription>
                                            </Alert>
                                        </motion.div>
                                    )}
                                    </AnimatePresence>

                                    <AnnotationEditor 
                                        annotation={workbenchAnnotation} 
                                        onEdit={handleEditAnnotation}
                                        suggestionsMap={qcSuggestions}
                                        onApplySuggestion={handleApplySuggestion}
                                    />

                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button 
                                                className="w-full h-12 text-base bg-green-600 hover:bg-green-700 shadow-lg shadow-green-900/20"
                                            >
                                                <Save className="mr-2 h-5 w-5" />
                                                Save Correction & Train
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    This will update the dataset statistics with your corrections and log this interaction for future training.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction onClick={handleSaveWorkbench} className="bg-green-600 hover:bg-green-700">
                                                    Confirm & Save
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </motion.div>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
