import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { Toaster } from 'sonner';

const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <Toaster position="bottom-right" theme="system" />
    <App />
  </React.StrictMode>
);