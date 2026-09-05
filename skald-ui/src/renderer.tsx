// src/renderer.tsx

import React from 'react';
import ReactDOM from 'react-dom/client';
import { ReactFlowProvider } from '@xyflow/react';
import App from './app';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';
import './styles/responsive.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ReactFlowProvider>
        <App />
      </ReactFlowProvider>
    </ErrorBoundary>
  </React.StrictMode>
);