require('dotenv').config();
const sequelize = require('./db');
const models = require('./models/models');
const path = require('path');
const express = require('express');
const cors = require('cors');


const homeRoutes = require('./routes/home');
const workspaceRoutes = require('./routes/workspaceRouter');
const userRoutes = require('./routes/userRouter');
const groupRoutes = require('./routes/groupRouter');

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
app.use('/api/user', userRoutes);
app.use('/api/groups', groupRoutes);

// Serve uploaded files (documents, images, etc.)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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

    // Back-compat: older schema versions had a UNIQUE constraint on desks(name) and/or unique indexes.
    // Requirements changed: desk names may repeat (even for the same user).
    // Drop known legacy constraints/indexes if present (safe no-op if not).
    try {
      // Postgres default name for UNIQUE(name) is typically "desks_name_key"
      await sequelize.query('ALTER TABLE "desks" DROP CONSTRAINT IF EXISTS "desks_name_key";');
      await sequelize.query('DROP INDEX IF EXISTS "desks_name_key";');
    } catch {
      // ignore
    }

    // In early development it's convenient to auto-align schema with models.
    // Set DB_SYNC_ALTER=true to enable non-destructive alters (still be careful in production).
    await sequelize.sync({ alter: process.env.DB_SYNC_ALTER === 'true' });

    // Back-compat: older schema versions had a UNIQUE index on desks(userId,name).
    // Requirements changed: desk names may repeat even for the same user.
    // Try to drop that unique index if it exists (safe no-op if not).
    try {
      const qi = sequelize.getQueryInterface();
      const indexes = await qi.showIndex('desks');
      const legacyIndexes = Array.isArray(indexes)
        ? indexes.filter((i) => {
            const fields = (i.fields || []).map((f) => f.attribute || f.name);
            const isUserName =
              fields.length === 2 && fields.includes('userId') && fields.includes('name');
            const isNameOnly = fields.length === 1 && fields[0] === 'name';
            return Boolean(i.unique) && (isUserName || isNameOnly);
          })
        : [];
      for (const idx of legacyIndexes) {
        if (idx?.name) {
          await qi.removeIndex('desks', idx.name);
        }
      }
    } catch {
      // ignore
    }

    app.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`Server started: http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('DB connection failed:', error.message);
  }
}

start();


