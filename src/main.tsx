import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
// webmcp-tools registers on import; importing it for that effect is the whole point.
import './webmcp-tools';
import { restorePackage } from './data/package-storage';
import { startPersistence } from './replay/persistence';

// The package comes back before the session does: a saved session is keyed by
// the package it was reviewed against, and its refs resolve against that package.
restorePackage();
void startPersistence();

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('Root element #root is missing');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
