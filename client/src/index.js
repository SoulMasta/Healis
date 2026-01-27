import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import './styles/global.css';
import './styles/responsive.css';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';

const rootEl = document.getElementById('root');
createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Enable PWA capabilities (offline cache, installability) in production builds.
// In development this will be a no-op (unless you explicitly serve a production build).
serviceWorkerRegistration.register();


