// Earliest possible log (stderr, no buffer) so Railway shows something if process starts
process.stderr.write('[BOOT] index.js loading\n');

// .env only locally; production uses Railway env vars (do not overwrite process.env).
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}
process.stderr.write('[BOOT] dotenv done\n');

// #region agent log
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err?.message || err);
  if (err?.stack) console.error(err.stack);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[unhandledRejection]', reason);
});
// #endregion

const crypto = require('crypto');
process.stderr.write('[BOOT] requiring db\n');
const sequelize = require('./db');
process.stderr.write('[BOOT] requiring models\n');
require('./models/models');
process.stderr.write('[BOOT] models done\n');
const path = require('path');
const express = require('express');
const cors = require('cors');
const http = require('http');
const cookieParser = require('cookie-parser');
const { initRealtime } = require('./realtime');


const homeRoutes = require('./routes/home');
const workspaceRoutes = require('./routes/workspaceRouter');
const userRoutes = require('./routes/userRouter');
const groupRoutes = require('./routes/groupRouter');
const projectRoutes = require('./routes/projectRouter');
const calendarRoutes = require('./routes/calendarRouter');
const notificationsRoutes = require('./routes/notificationsRouter');
const aiRoutes = require('./routes/aiRouter');
const libraryRoutes = require('./routes/libraryRouter');
const storageRoutes = require('./routes/storageRouter');
const { startCalendarNotificationWorker } = require('./services/calendarNotificationWorker');
const { startCleanup: startRateLimitCleanup } = require('./middleware/rateLimit');

// Always run backend on port 5000 for consistency across local and container runs.
const port = 5000;
process.stderr.write('[BOOT] server port forced to 5000\n');
const app = express();

function makeInviteCode(len = 10) {
  // Exclude ambiguous chars (0/O, 1/I, etc).
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

// If deployed behind a proxy (Railway/Nginx), this enables correct req.ip / secure cookies.
app.set('trust proxy', 1);

// ——— 1. Global logger: all incoming requests ———
// Global request logging removed to reduce noisy output in development.

// ——— 2. REQUEST REACHED EXPRESS ———
// Lightweight express entry marker removed.

// Middleware order: cors → OPTIONS short-circuit → express.json → cookieParser → routes → errorHandler (last).
// CORS: must be first, before any routes. credentials:true requires explicit origin (no wildcard).
const isDev = process.env.NODE_ENV !== 'production';
const isLocalRun = !process.env.RAILWAY_ENVIRONMENT; // Railway sets this; locally it's absent
const allowedOrigins = [
  'https://healis111.vercel.app',
  // healis + healis111 and their previews (e.g. healis-xxx, healis111-xxx.vercel.app)
  /^https:\/\/(healis|healis111)(-[\w\-.]+)?\.vercel\.app$/,
  ...(isDev || isLocalRun ? ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5000', 'http://127.0.0.1:5000'] : []),
];
const envOrigins = [process.env.CORS_ORIGINS, process.env.CORS_ORIGIN, process.env.CLIENT_URL]
  .filter(Boolean)
  .flatMap((s) => s.split(',').map((x) => x.trim()).filter(Boolean));

// ——— Before CORS: log origin and allowed list ———
// CORS pre-check logging removed.

function corsOrigin(origin, cb) {
  if (!origin) return cb(null, true); // same-origin or non-browser
  const allowed = allowedOrigins.find((o) =>
    typeof o === 'string' ? o === origin : o.test(origin)
  );
  if (allowed) return cb(null, origin); // reflect origin for credentials
  if (envOrigins.includes(origin)) return cb(null, origin);
  return cb(null, false);
}
app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-device-id'],
  })
);

// ——— After CORS: log origin, allowed, and response headers on finish ———
// CORS after-hooks removed to avoid verbose logging.
// Preflight: OPTIONS always 200 so CORS headers from cors() are sent and auth is never hit.
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});
app.use(express.json());
app.use(cookieParser());

// Public routes (no auth): health, debug, manifest, static
app.get('/api/debug', (req, res) => {
  res.json({
    port: process.env.PORT,
    env: process.env.NODE_ENV,
    uptime: process.uptime(),
  });
});

// Liveness: 200 immediately, no DB. Use this as Railway health check path so proxy stops returning 502.
app.get('/api/health/live', (req, res) => {
  res.status(200).json({ ok: true });
});

app.get('/api/health', async (req, res) => {
  const hasDbEnv = Boolean(
    process.env.DATABASE_URL ||
      (process.env.DB_NAME &&
        process.env.DB_USER &&
        process.env.DB_PASSWORD &&
        process.env.DB_HOST &&
        process.env.DB_PORT)
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
    port,
    db,
    time: new Date().toISOString(),
  });
});

// manifest.json — public, no auth (backend may not have client build when frontend on Vercel)
const clientBuildDir = path.join(__dirname, '..', 'client', 'build');
app.get('/manifest.json', (req, res) => {
  res.sendFile(path.join(clientBuildDir, 'manifest.json'), (err) => {
    if (err) res.status(404).end();
  });
});

// Mount "page" routes
app.use('/home', homeRoutes);
app.use('/workspace', workspaceRoutes);
app.use('/api/user', userRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/library', libraryRoutes);
app.use('/api/storage', storageRoutes);

// Note: File uploads are now handled by Supabase Storage
// Old /uploads static serving removed - all files served from Supabase public URLs

// Root -> Home
// Railway health check uses Host: healthcheck.railway.app and expects 200 (302 = fail → 502)
app.get('/', (req, res) => {
  if (req.get('host') === 'healthcheck.railway.app') return res.status(200).json({ ok: true });
  res.redirect('/home');
});

// Serve React build if present (production-style)
app.use(express.static(clientBuildDir));

// ——— 7. After routes: 404 logging (only when we actually respond 404) ———
// SPA fallback: if someone hits /home etc after build, ensure index.html is served.
app.use((req, res) => {
  const indexPath = path.join(clientBuildDir, 'index.html');
  return res.sendFile(indexPath, (err) => {
    if (err) {
      // 404 logging removed (kept response below)
      return res.status(404).json({ error: 'Not found' });
    }
  });
});

// Error handler — last middleware
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

async function waitForDB(sequelize) {
  let retries = 10;

  while (retries) {
    try {
      await sequelize.authenticate();
      console.log("DB connected");
      return;
    } catch (e) {
      console.log("Waiting for DB...");
      retries--;
      await new Promise(res => setTimeout(res, 5000));
    }
  }

  throw new Error("DB not available");
}

async function start() {
  await waitForDB(sequelize);
  process.stderr.write('[BOOT] start() entered\n');
  const server = http.createServer(app);
  initRealtime(server);
  startRateLimitCleanup(5 * 60_000);
  // (instrumentation removed)

  server.on('error', (err) => {
    // Log listen errors and re-throw to preserve existing behavior.
    console.error('[LISTEN ERROR]', err && err.message);
    throw err;
  });

  server.listen(port, '0.0.0.0', () => {
    process.stderr.write('[LISTEN] Server listening on http://0.0.0.0:' + port + '\n');
    // Reduced startup logging to minimize console noise.
  });

  try {
    await sequelize.authenticate();

    // Use Sequelize to manage schema exclusively.
    // Force non-destructive alignment with models.
    await sequelize.sync({ alter: true });

    // Start background workers only after DB is confirmed healthy.
    startCalendarNotificationWorker({ intervalMs: 60_000 });

    // Backfill: ensure existing groups have inviteCode (data-only, no schema changes).
    try {
      const { Group } = require('./models/models');
      const groups = await Group.findAll({ where: { inviteCode: null } });
      for (const g of groups) {
        let tries = 0;
        while (tries < 8) {
          tries += 1;
          const code = makeInviteCode(10);
          try {
            await Group.update({ inviteCode: code }, { where: { groupId: g.groupId, inviteCode: null } });
            break;
          } catch (e) {
            const msg = String(e?.message || '').toLowerCase();
            if (msg.includes('duplicate') || msg.includes('unique')) continue;
            break;
          }
        }
      }
    } catch {
      // ignore
    }

    // Seed: ensure predefined subjects for 2 курс, факультет "Лечебное дело" exist.
    try {
      const { Subject } = require('./models/models');
      const subjects = [
        'Патологическая анатомия',
        'Патофизиология',
        'Микробиология',
        'Топографическая анатомия и оперативная хирургия',
        'Гигиена',
        'Сестринское дело',
        'Прикладная физическая культура и спорт',
        'Практика по получению первичных навыков научно-исследовательской работы',
        'Практика по получению профессиональных умений и опыта профессиональной деятельности \"Сестринская\"',
        'Организация предпринимательской деятельности',
        'Философия',
        'Иностранный язык для профессионального общения'
      ];
      for (const name of subjects) {
        try {
          await Subject.findOrCreate({
            where: { name, faculty: 'Лечебное дело', course: 2 },
            defaults: { name, faculty: 'Лечебное дело', course: 2 },
          });
A        } catch {
          // ignore individual failures
        }
      }
    } catch (e) {
      // ignore seeding errors
    }
  } catch (error) {
    console.error('DB connection failed:', error.message);
  }
}

process.stderr.write('[BOOT] calling start()\n');
start().catch((err) => {
  process.stderr.write('[BOOT] start() failed: ' + (err && err.message) + '\n');
  console.error(err);
});


