import React from 'react';
import { useStore } from '../../store';
import { LayoutDashboard, Search, Terminal, Database, Sun, Moon } from 'lucide-react';
import { cn } from '../../lib/utils';

export function Layout({ children }: { children: React.ReactNode }) {
  const { view, setView, annotatorQueueCount } = useStore();
  const [theme, setTheme] = React.useState('dark');

  const toggleTheme = () => {
    const t = theme === 'dark' ? 'light' : 'dark';
    setTheme(t);
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.classList.add(t);
  };

  React.useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  const NavItem = ({ v, icon: Icon, label, badge }: any) => (
    <button
      onClick={() => setView(v)}
      className={cn(
        "flex w-full items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
        view === v ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="flex-1 text-left">{label}</span>
      {badge > 0 && <span className="bg-background/20 px-1.5 rounded-full text-xs">{badge}</span>}
    </button>
  );

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <aside className="w-64 border-r border-border bg-card flex flex-col p-4">
        <div className="mb-8 px-2">
          <h1 className="text-xl font-black bg-gradient-to-r from-rose-500 to-purple-600 bg-clip-text text-transparent">MAGDALENKA</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            <span className="text-[10px] font-mono text-muted-foreground">SOTA ACTIVE</span>
          </div>
        </div>
        
        <nav className="space-y-1 flex-1">
          <NavItem v="dashboard" icon={LayoutDashboard} label="Knowledge Graph" />
          <NavItem v="curator" icon={Search} label="Curator Swarm" />
          <NavItem v="annotator" icon={Terminal} label="Annotator" badge={annotatorQueueCount} />
          <NavItem v="rag" icon={Database} label="Corpus RAG" />
        </nav>

        <button onClick={toggleTheme} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground p-2">
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          Toggle Theme
        </button>
      </aside>
      <main className="flex-1 overflow-auto p-8 relative">
        {children}
      </main>
    </div>
  );
}