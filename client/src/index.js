import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './app/App';
import './styles/global.css';
import './styles/responsive.css';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';
import './http/axiosConfig';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30 * 1000, refetchOnWindowFocus: false },
  },
});

const rootEl = document.getElementById('root');
createRoot(rootEl).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);

// Enable PWA capabilities (offline cache, installability) in production builds.
// In development this will be a no-op (unless you explicitly serve a production build).
serviceWorkerRegistration.register();

// Attempt to lock screen orientation to portrait where supported.
// Manifest.json already sets "orientation": "portrait" for PWAs, but some
// browsers require calling the Screen Orientation API (and/or a user gesture).
const lockAppOrientation = async (orientation = 'portrait') => {
  if (typeof window === 'undefined' || !('screen' in window)) return;
  const scr = window.screen;
  const lockFn =
    (scr.orientation && scr.orientation.lock && scr.orientation.lock.bind(scr.orientation)) ||
    scr.lockOrientation ||
    scr.mozLockOrientation ||
    scr.msLockOrientation;

  if (!lockFn) return;
  try {
    await lockFn(orientation);
    // eslint-disable-next-line no-console
    console.debug('Orientation locked to', orientation);
  } catch (err) {
    // Lock may fail if not in fullscreen or if user gesture is required.
    // If running as an installed PWA (display-mode: standalone) try again.
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
      try {
        await lockFn(orientation);
      } catch (e) {
        // ignore
      }
    }
  }
};

// Try immediately (works in some installed PWAs) and on first user interaction.
lockAppOrientation('portrait');
['click', 'touchstart', 'keydown'].forEach((evt) =>
  window.addEventListener(
    evt,
    () => {
      lockAppOrientation('portrait');
    },
    { once: true }
  )
);


