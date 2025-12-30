const path = require('path');

/**
 * For now, each "page" route simply serves the React app shell.
 * This keeps backend navigation compatible with a SPA frontend.
 */
function sendReactApp(req, res) {
  const clientBuildIndex = path.join(__dirname, '..', '..', 'client', 'build', 'index.html');
  return res.sendFile(clientBuildIndex, (err) => {
    if (err) {
      // In dev, the client build may not exist; make this explicit.
      return res
        .status(501)
        .json({ error: 'Client build not found. Run `npm run build` in /client or use CRA dev server.' });
    }
  });
}

/**
 * Simple navigation handler: returns canonical page + path.
 * Frontend can call this to confirm a navigation target.
 */
function navigate(pageKey) {
  return (req, res) => {
    const allowed = new Set(['home', 'workspace', 'calendar', 'settings']);
    if (!allowed.has(pageKey)) return res.status(400).json({ error: 'Unknown page' });
    return res.json({ page: pageKey, path: `/${pageKey}` });
  };
}

module.exports = {
  sendReactApp,
  navigate,
};


