// Based on CRA PWA template registration logic.
// Docs: https://cra.link/PWA

const isLocalhost = Boolean(
  window.location.hostname === 'localhost' ||
    window.location.hostname === '[::1]' ||
    // 127.0.0.0/8 are considered localhost for IPv4.
    window.location.hostname.match(
      /^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/
    )
);

export function register(config) {
  if (process.env.NODE_ENV !== 'production') return;
  if (!('serviceWorker' in navigator)) return;

  const publicUrl = new URL(process.env.PUBLIC_URL, window.location.href);
  if (publicUrl.origin !== window.location.origin) {
    // Our service worker won't work if PUBLIC_URL is on a different origin.
    return;
  }

  window.addEventListener('load', () => {
    const swUrl = `${process.env.PUBLIC_URL}/service-worker.js`;
    if (isLocalhost) {
      checkValidServiceWorker(swUrl, config);
      navigator.serviceWorker.ready.then(() => {
        // eslint-disable-next-line no-console
        console.log('Service worker ready (localhost).');
      });
    } else {
      registerValidSW(swUrl, config);
    }
  });
}

function registerValidSW(swUrl, config) {
  navigator.serviceWorker
    .register(swUrl)
    .then((registration) => {
      registration.onupdatefound = () => {
        const installingWorker = registration.installing;
        if (!installingWorker) return;
        installingWorker.onstatechange = () => {
          if (installingWorker.state !== 'installed') return;
          if (navigator.serviceWorker.controller) {
            // eslint-disable-next-line no-console
            console.log('New content is available; please refresh.');
            config?.onUpdate?.(registration);
          } else {
            // eslint-disable-next-line no-console
            console.log('Content is cached for offline use.');
            config?.onSuccess?.(registration);
          }
        };
      };
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Error during service worker registration:', error);
    });
}

function checkValidServiceWorker(swUrl, config) {
  fetch(swUrl, { headers: { 'Service-Worker': 'script' } })
    .then((response) => {
      const contentType = response.headers.get('content-type');
      if (response.status === 404 || (contentType && !contentType.includes('javascript'))) {
        // No service worker found. Unregister existing ones and reload.
        navigator.serviceWorker.ready
          .then((registration) => registration.unregister())
          .then(() => window.location.reload());
      } else {
        registerValidSW(swUrl, config);
      }
    })
    .catch(() => {
      // eslint-disable-next-line no-console
      console.log('No internet connection found. App is running in offline mode.');
    });
}

export function unregister() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready.then((registration) => registration.unregister());
}


