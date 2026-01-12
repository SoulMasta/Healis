require('dotenv').config();
const sequelize = require('./db');
const models = require('./models/models');
const path = require('path');
const express = require('express');
const cors = require('cors');


const homeRoutes = require('./routes/home');
const workspaceRoutes = require('./routes/workspace');
const calendarRoutes = require('./routes/calendar');
const settingsRoutes = require('./routes/settings');

const PORT = Number(process.env.PORT) || 5000;
const app = express();

app.use(cors());
app.use(express.json());

// Health check proves frontend<->backend connectivity.
app.get('/api/health', async (req, res) => {
  const hasDbEnv = Boolean(
    process.env.DB_NAME &&
      process.env.DB_USER &&
      process.env.DB_PASSWORD &&
      process.env.DB_HOST &&
      process.env.DB_PORT
  );

  let db = { configured: hasDbEnv, ok: false };
  if (hasDbEnv && sequelize) {
    try {
      await sequelize.authenticate();
      db.ok = true;
    } catch (e) {
      db.ok = false;
      db.error = e?.message || String(e);
    }
  }

  res.json({
    ok: true,
    service: 'healis-server',
    port: PORT,
    db,
    time: new Date().toISOString(),
  });
});

// Mount "page" routes
app.use('/home', homeRoutes);
app.use('/workspace', workspaceRoutes);
app.use('/calendar', calendarRoutes);
app.use('/settings', settingsRoutes);

// Root -> Home
app.get('/', (req, res) => res.redirect('/home'));

// Serve React build if present (production-style)
const clientBuildDir = path.join(__dirname, '..', 'client', 'build');
app.use(express.static(clientBuildDir));

// SPA fallback: if someone hits /home etc after build, ensure index.html is served.
app.use((req, res) => {
  const indexPath = path.join(clientBuildDir, 'index.html');
  return res.sendFile(indexPath, (err) => {
    if (err) return res.status(404).json({ error: 'Not found' });
  });
});

async function start() {
  try {
    await sequelize.authenticate();
    await sequelize.sync();
    app.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`Server started: http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('DB connection failed:', error.message);
  }
}

start();


