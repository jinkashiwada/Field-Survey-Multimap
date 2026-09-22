import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'ol/ol.css';
import './styles/global.css';
import { App } from './app/App';
import { expandCompactHash } from './services/compactUrl';

const root = document.getElementById('root');
if (!root) throw new Error('Application root was not found.');
const appRoot = root;

async function start(): Promise<void> {
  const expanded = await expandCompactHash(window.location.hash);
  if (expanded.hash !== window.location.hash) {
    const url = new URL(window.location.href);
    url.hash = expanded.hash;
    window.history.replaceState(window.history.state, '', url);
  }
  createRoot(appRoot).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void start();
