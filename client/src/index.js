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


