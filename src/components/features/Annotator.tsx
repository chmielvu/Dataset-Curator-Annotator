import React, { useState } from 'react';
import { useStore } from '../../store';
import { db } from '../../lib/db';
import { runAnnotator, runQC } from '../../actions';
import { ShieldCheck, ArrowRight, Save, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

export default function Annotator() {
  const { refreshStats } = useStore();
  const [currentPost, setCurrentPost] = useState<any>(null);
  const [annotation, setAnnotation] = useState<any>(null);
  const [qcResult, setQcResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const loadNext = async () => {
    const post = await db.posts.where('status').equals('queued').first();
    if (post) {
      setLoading(true);
      try {
        const result = await runAnnotator(post.text);
        setCurrentPost(post);
        setAnnotation(result);
        setQcResult(null);
      } catch (e) {
        toast.error("Annotation failed");
      }
      setLoading(false);
    } else {
      toast.info("Queue empty");
      setCurrentPost(null);
    }
  };

  const handleQC = async () => {
    if (!currentPost || !annotation) return;
    const toastId = toast.loading("QC Supervisor Reasoning...");
    try {
      const res = await runQC(currentPost.text, annotation);
      setQcResult(res);
      toast.dismiss(toastId);
      if(res.qc_passed) toast.success("QC Passed");
      else toast.warning("QC Issues Found");
    } catch (e) {
      toast.error("QC Failed");
    }
  };

  const save = async () => {
    if (!currentPost) return;
    await db.posts.update(currentPost.id!, { 
      status: 'annotated', 
      annotation: annotation 
    });
    
    // Update Stats (Simplified)
    const currentState = await db.dataset.get('currentState');
    const state = currentState?.data || { cleavages: {}, tactics: {}, emotions: {}, total_annotations_processed: 0 };
    state.total_annotations_processed++;
    // Add logic to increment specific counts here based on annotation
    await db.dataset.put({ id: 'currentState', data: state });
    
    toast.success("Saved");
    setCurrentPost(null);
    setAnnotation(null);
    setQcResult(null);
    refreshStats();
  };

  React.useEffect(() => { loadNext(); }, []);

  if (!currentPost && !loading) return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      Queue is empty. Use Curator to find more posts.
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Interactive Workbench</h2>
        <span className="text-xs font-mono text-muted-foreground">AUTO-ANNOTATOR v3</span>
      </div>

      <div className="bg-card border rounded-lg p-6 shadow-sm min-h-[150px]">
        {loading ? (
          <div className="animate-pulse space-y-2">
            <div className="h-4 bg-muted rounded w-3/4"></div>
            <div className="h-4 bg-muted rounded w-1/2"></div>
          </div>
        ) : (
          <p className="text-lg leading-relaxed">{currentPost?.text}</p>
        )}
      </div>

      {annotation && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 border rounded bg-muted/20">
              <h4 className="text-xs uppercase font-bold text-muted-foreground mb-2">Tactics</h4>
              <div className="flex flex-wrap gap-2">
                {annotation.tactics.map((t: string) => (
                  <span key={t} className="px-2 py-1 bg-primary/10 text-primary text-xs rounded border border-primary/20">{t}</span>
                ))}
              </div>
            </div>
            <div className="p-4 border rounded bg-muted/20">
              <h4 className="text-xs uppercase font-bold text-muted-foreground mb-2">Emotion</h4>
              <span className="text-sm font-medium">{annotation.emotion_fuel}</span>
            </div>
          </div>

          <AnimatePresence>
            {qcResult && (
              <motion.div 
                initial={{ height: 0 }} animate={{ height: 'auto' }} 
                className={`p-4 rounded border ${qcResult.qc_passed ? 'bg-green-500/10 border-green-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}
              >
                <div className="flex items-start gap-3">
                  {qcResult.qc_passed ? <ShieldCheck className="w-5 h-5 text-green-500"/> : <XCircle className="w-5 h-5 text-amber-500"/>}
                  <div>
                    <h4 className="font-bold text-sm">{qcResult.qc_passed ? "QC Passed" : "Attention Needed"}</h4>
                    <p className="text-sm opacity-90">{qcResult.feedback}</p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex justify-end gap-3">
            <button onClick={handleQC} className="px-4 py-2 border rounded hover:bg-muted flex items-center gap-2 text-sm">
              <ShieldCheck className="w-4 h-4"/> Run Supervisor (Gemini 3)
            </button>
            <button onClick={save} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-2 text-sm font-medium shadow-lg shadow-green-900/20">
              <Save className="w-4 h-4"/> Approve & Train
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}