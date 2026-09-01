import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startPersistence } from './replay/persistence';
import { registerTools } from './webmcp-tools';

registerTools();
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
