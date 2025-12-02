import React, { useEffect, useState } from 'react';
import { useAppStore } from './store/useAppStore';
import { Search, Terminal, ShieldCheck, LayoutDashboard, Database, Moon, Sun, Loader2, AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import CuratorView from './components/CuratorView';
import AnnotatorView from './components/AnnotatorView';
import VerificationView from './components/VerificationView';
import DashboardView from './components/DashboardView';
import CorpusView from './components/CorpusView';
import { Button } from './components/ui/button';
import { cn } from './lib/utils';
import { db } from './lib/dexie';
import { motion, AnimatePresence } from 'framer-motion';

const SidebarItem = ({ view, icon: Icon, label, count }: any) => {
    const { currentView, setView } = useAppStore();
    const isActive = currentView === view;
    
    return (
        <button
            onClick={() => setView(view)}
            className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-md transition-all text-sm font-medium",
                isActive 
                    ? "bg-primary text-primary-foreground shadow-sm" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
        >
            <Icon size={18} />
            <span className="flex-1 text-left">{label}</span>
            {count > 0 && (
                <span className="bg-background/20 text-xs px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
                    {count}
                </span>
            )}
        </button>
    );
};

export default function App() {
    const { initializeData, queueCounts, theme, toggleTheme, currentView, isInitialized } = useAppStore();
    const [isSlowLoading, setIsSlowLoading] = useState(false);
    const [isFatalError, setIsFatalError] = useState(false);
    const [errorDetails, setErrorDetails] = useState<string>('');
    const [loadingMessage, setLoadingMessage] = useState("Initializing SOTA Pipeline...");

    useEffect(() => {
        const init = async () => {
            try {
                await initializeData();
            } catch (e: any) {
                console.error("FATAL INIT ERROR:", e);
                setIsFatalError(true);
                setErrorDetails(e.message || "Unknown initialization error");
            }
        };
        init();
        
        // Set initial theme class
        document.documentElement.classList.add('dark');
    }, []);

    // Cycle loading messages to show activity
    useEffect(() => {
        if (isInitialized) return;
        
        const messages = [
            "Initializing SOTA Pipeline...",
            "Connecting to Local Vector Database...",
            "Verifying Agent Schemas...",
            "Loading Knowledge Graph Engine...",
            "Warming up Gemini 3 Pro..."
        ];
        
        let i = 0;
        const interval = setInterval(() => {
            i = (i + 1) % messages.length;
            setLoadingMessage(messages[i]);
        }, 1200);
        
        return () => clearInterval(interval);
    }, [isInitialized]);

    useEffect(() => {
        let timeoutId: ReturnType<typeof setTimeout>;
        if (!isInitialized && !isFatalError) {
            timeoutId = setTimeout(() => {
                setIsSlowLoading(true);
            }, 5000); // Show message if loading takes longer than 5s
        }
        return () => clearTimeout(timeoutId);
    }, [isInitialized, isFatalError]);

    const handleHardReset = async () => {
        if (confirm("This will DELETE ALL LOCAL DATA (database and settings) and reload the app. Are you sure?")) {
            try {
                await db.deleteDatabase();
                window.location.reload();
            } catch (e) {
                alert("Failed to delete database. Please clear browser data manually.");
            }
        }
    };

    if (isFatalError) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-background text-foreground flex-col gap-6 p-8 text-center">
                <div className="p-4 rounded-full bg-destructive/10 text-destructive">
                    <AlertTriangle className="h-12 w-12" />
                </div>
                <div className="space-y-2 max-w-md">
                    <h1 className="text-2xl font-bold tracking-tight">System Failure</h1>
                    <p className="text-muted-foreground">The application failed to initialize. This is likely due to a database version mismatch or corrupted local data.</p>
                    <p className="text-xs font-mono bg-muted p-2 rounded text-left overflow-x-auto border border-border">
                        Error: {errorDetails}
                    </p>
                </div>
                <div className="flex gap-4">
                    <Button variant="outline" onClick={() => window.location.reload()}>
                        <RefreshCw className="mr-2 h-4 w-4" /> Try Reloading
                    </Button>
                    <Button variant="destructive" onClick={handleHardReset}>
                        <Trash2 className="mr-2 h-4 w-4" /> Hard Reset (Clear Data)
                    </Button>
                </div>
            </div>
        );
    }

    if (!isInitialized) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-background text-foreground flex-col gap-6">
                 <div className="relative">
                    <Loader2 className="h-12 w-12 animate-spin text-primary" />
                    <div className="absolute inset-0 blur-xl bg-primary/20 rounded-full animate-pulse" />
                 </div>
                 
                 <div className="h-6 flex items-center justify-center">
                    <AnimatePresence mode="wait">
                        <motion.p 
                            key={loadingMessage}
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -5 }}
                            className="text-muted-foreground font-mono text-sm"
                        >
                            {loadingMessage}
                        </motion.p>
                    </AnimatePresence>
                 </div>

                 {isSlowLoading && (
                     <motion.div 
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex items-center gap-3 text-amber-500 bg-amber-500/10 px-6 py-3 rounded-lg border border-amber-500/20 max-w-xs"
                     >
                         <AlertTriangle className="h-5 w-5 shrink-0" />
                         <div className="flex flex-col items-start text-left">
                             <span className="text-sm font-bold">Taking longer than usual...</span>
                             <span className="text-xs opacity-80">This can happen during large database migrations or on slower devices. Please wait.</span>
                         </div>
                     </motion.div>
                 )}
            </div>
        );
    }

    return (
        <div className="flex min-h-screen bg-background text-foreground">
            {/* Sidebar */}
            <aside className="w-64 border-r border-border bg-card hidden md:flex flex-col">
                <div className="p-6">
                    <h1 className="text-xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-rose-500 to-purple-600">
                        MAGDALENKA
                    </h1>
                    <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs text-muted-foreground font-mono">v3.1 SOTA ACTIVE</span>
                        <div className="flex h-2 w-2 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                        </div>
                    </div>
                </div>

                <nav className="flex-1 px-4 space-y-2">
                    <SidebarItem view="dashboard" icon={LayoutDashboard} label="Knowledge Graph" />
                    <div className="pt-4 pb-2">
                        <p className="px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pipeline</p>
                    </div>
                    <SidebarItem view="curator" icon={Search} label="Curator Swarm" />
                    <SidebarItem view="annotator" icon={Terminal} label="Auto-Annotator" count={queueCounts.curation} />
                    <SidebarItem view="verification" icon={ShieldCheck} label="Verification" count={queueCounts.verification} />
                    
                    <div className="pt-4 pb-2">
                        <p className="px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Data</p>
                    </div>
                    <SidebarItem view="corpus" icon={Database} label="RAG Corpus" />
                </nav>

                <div className="p-4 border-t border-border">
                    <Button variant="ghost" className="w-full justify-start gap-2" onClick={toggleTheme}>
                        {theme === 'dark' ? <Sun size={16}/> : <Moon size={16}/>}
                        {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                    </Button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                <header className="md:hidden h-14 border-b border-border flex items-center px-4 justify-between bg-card">
                    <span className="font-bold">Magdalenka Mobile</span>
                    {/* Mobile menu trigger would go here */}
                </header>

                <div className="flex-1 overflow-y-auto p-4 md:p-8">
                    <div className="max-w-6xl mx-auto space-y-6">
                        {currentView === 'dashboard' && <DashboardView />}
                        {currentView === 'curator' && <CuratorView />}
                        {currentView === 'annotator' && <AnnotatorView />}
                        {currentView === 'verification' && <VerificationView />}
                        {currentView === 'corpus' && <CorpusView />}
                    </div>
                </div>
            </main>
        </div>
    );
}