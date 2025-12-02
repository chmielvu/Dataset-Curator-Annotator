import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { Toaster } from './components/ui/sonner';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error("Could not find root element");

const root = createRoot(rootElement);
root.render(
  <>
    <Toaster />
    <App />
  </>
);