import React, { useEffect } from 'react';
import { useStore } from './store';
import { Layout } from './components/ui/Layout';
import Curator from './components/features/Curator';
import Annotator from './components/features/Annotator';
import KnowledgeGraph from './components/features/KnowledgeGraph';
import Corpus from './components/features/Corpus';

export default function App() {
  const { view, refreshStats } = useStore();

  useEffect(() => {
    refreshStats();
  }, []);

  return (
    <Layout>
      {view === 'dashboard' && <KnowledgeGraph />}
      {view === 'curator' && <Curator />}
      {view === 'annotator' && <Annotator />}
      {view === 'rag' && <Corpus />}
    </Layout>
  );
}