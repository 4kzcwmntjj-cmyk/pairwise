import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './app/install'; // starts listening for the browser's install prompt before the app draws
import { checkWhenShown, watchForUpdates } from './app/update';
import './styles.css';

// Lets the app start without a connection (public/sw.js). Not in the dev server, where it would serve stale files.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  watchForUpdates();
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(checkWhenShown).catch(() => {
      // Private windows and some browsers refuse; the app works as before, just online only.
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
