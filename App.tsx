import React, { useEffect, useState } from 'react';
import { useAppStore } from './store/useAppStore';
import { Search, Terminal, ShieldCheck, LayoutDashboard, Database, Moon, Sun, Sparkles, Loader2, AlertTriangle } from 'lucide-react';
import CuratorView from './components/CuratorView';
import AnnotatorView from './components/AnnotatorView';
import VerificationView from './components/VerificationView';
import DashboardView from './components/DashboardView';
import CorpusView from './components/CorpusView';
import { Button } from './components/ui/button';
import { cn } from './lib/utils';

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

    useEffect(() => {
        initializeData();
        // Set initial theme class
        document.documentElement.classList.add('dark');
    }, []);

    useEffect(() => {
        let timeoutId: ReturnType<typeof setTimeout>;
        if (!isInitialized) {
            timeoutId = setTimeout(() => {
                setIsSlowLoading(true);
            }, 3000); // Show message if loading takes longer than 3s
        }
        return () => clearTimeout(timeoutId);
    }, [isInitialized]);

    if (!isInitialized) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-background text-foreground flex-col gap-4">
                 <Loader2 className="h-10 w-10 animate-spin text-primary" />
                 <p className="text-muted-foreground font-mono text-sm animate-pulse">Initializing SOTA Pipeline...</p>
                 {isSlowLoading && (
                     <div className="flex items-center gap-2 text-amber-500 bg-amber-500/10 px-4 py-2 rounded-md animate-in fade-in slide-in-from-bottom-2">
                         <AlertTriangle className="h-4 w-4" />
                         <span className="text-xs">Loading large dataset... please wait.</span>
                     </div>
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