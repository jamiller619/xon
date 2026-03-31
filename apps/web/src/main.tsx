import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');

const app = (
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);

// Use hydrateRoot when SSR has injected element children; createRoot otherwise
if (rootEl.firstElementChild !== null) {
  hydrateRoot(rootEl, app);
} else {
  createRoot(rootEl).render(app);
}
