import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import AnnotationEditor from './AnnotationEditor';
import { Check, SkipForward, AlertCircle, RefreshCw } from 'lucide-react';
import { UiSuggestion } from '../types';

export default function VerificationView() {
    const { currentVerificationItem, loadNextVerificationItem, submitVerification, skipVerificationItem, queueCounts } = useAppStore();
    const [activeAnnotation, setActiveAnnotation] = useState<any>(null);
    const [wasEdited, setWasEdited] = useState(false);
    const [suggestionsMap, setSuggestionsMap] = useState<Map<string, UiSuggestion>>(new Map());

    useEffect(() => {
        if (!currentVerificationItem && queueCounts.verification > 0) {
            loadNextVerificationItem();
        }
    }, [queueCounts.verification]);

    useEffect(() => {
        if (currentVerificationItem) {
            setActiveAnnotation(currentVerificationItem.annotation);
            setWasEdited(false);
            setSuggestionsMap(new Map()); // Reset suggestions
        }
    }, [currentVerificationItem]);

    const handleEdit = (field: string, value: any, path?: string) => {
        setActiveAnnotation((prev: any) => {
            if (!prev) return prev;
            const next = { ...prev }; // Shallow copy is ok for top level, but be careful with nested arrays
            
            if (field === 'labels' && Array.isArray(value)) {
                next.labels = [...value];
            } else if (field === 'tactics' && Array.isArray(value)) {
                next.tactics = [...value];
            } else {
                next[field] = value;
            }
            return next;
        });
        setWasEdited(true);
    };

    if (!currentVerificationItem) {
        return (
            <div className="flex flex-col items-center justify-center h-[50vh] text-center space-y-4 animate-in fade-in zoom-in duration-300">
                <div className="p-6 rounded-full bg-muted/50 border-2 border-dashed">
                    <Check className="h-12 w-12 text-muted-foreground/50" />
                </div>
                <div className="space-y-2">
                    <h3 className="text-xl font-semibold">All Caught Up</h3>
                    <p className="text-muted-foreground max-w-sm mx-auto">
                        The verification queue is empty. Use the <span className="text-primary font-medium">Curator</span> or <span className="text-primary font-medium">Annotator</span> to generate more tasks.
                    </p>
                </div>
                <Button variant="outline" onClick={loadNextVerificationItem} className="gap-2">
                    <RefreshCw className="h-4 w-4" /> Check for New Items
                </Button>
            </div>
        );
    }

    return (
        <div className="grid lg:grid-cols-2 gap-6 h-[calc(100vh-8rem)]">
            {/* Left Column: Context */}
            <div className="space-y-6 flex flex-col h-full">
                <Card className="flex-1 flex flex-col border-primary/20 shadow-sm overflow-hidden">
                    <CardHeader className="bg-muted/10 border-b">
                        <CardTitle className="flex items-center justify-between">
                            Source Content
                            <Badge variant="outline" className="font-mono text-xs">ID: {currentVerificationItem.id}</Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-y-auto p-0">
                        <div className="p-6">
                            <blockquote className="text-lg leading-relaxed p-6 bg-muted/30 border-l-4 border-primary rounded-r-lg italic shadow-inner">
                                "{currentVerificationItem.postText}"
                            </blockquote>
                            
                            <div className="mt-8 space-y-4">
                                 <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b pb-2">Model Confidence</h4>
                                 <div className="flex items-center gap-2 mt-2">
                                    <Badge variant={((activeAnnotation?.confidence || 0) > 0.8) ? "default" : "secondary"}>
                                        {((activeAnnotation?.confidence || 0.95) * 100).toFixed(0)}%
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">Calibrated score based on code execution logic</span>
                                 </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Right Column: Editor */}
            <div className="flex flex-col gap-4 h-full">
                <Card className="flex-1 overflow-hidden flex flex-col shadow-md border-t-4 border-t-primary">
                    <CardHeader className="py-4 border-b bg-card">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-base">Annotation Editor</CardTitle>
                            {wasEdited && <Badge variant="secondary" className="animate-pulse">Modified</Badge>}
                        </div>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-y-auto p-6 bg-background/50">
                        {activeAnnotation ? (
                            <AnnotationEditor 
                                annotation={activeAnnotation} 
                                onEdit={handleEdit} 
                                suggestionsMap={suggestionsMap}
                                onApplySuggestion={() => {}}
                            />
                        ) : (
                            <div className="flex items-center justify-center h-full text-muted-foreground">Loading...</div>
                        )}
                    </CardContent>
                </Card>

                <div className="grid grid-cols-2 gap-4 pt-2">
                     <Button 
                        size="lg" 
                        variant="default" 
                        className="bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-900/20"
                        onClick={() => submitVerification(activeAnnotation, wasEdited, "Manual Acceptance")}
                    >
                        <Check className="mr-2 h-5 w-5"/> Verify & Accept
                     </Button>
                     <Button 
                        size="lg" 
                        variant="outline"
                        onClick={skipVerificationItem}
                        className="border-dashed"
                    >
                        <SkipForward className="mr-2 h-5 w-5"/> Skip
                     </Button>
                </div>
            </div>
        </div>
    );
}