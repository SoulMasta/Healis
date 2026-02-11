require('dotenv').config();
const crypto = require('crypto');
const sequelize = require('./db');
require('./models/models');
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
const { startCalendarNotificationWorker } = require('./services/calendarNotificationWorker');
const { startCleanup: startRateLimitCleanup } = require('./middleware/rateLimit');

const PORT = Number(process.env.PORT) || 5000;
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

const allowedOrigins = String(process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (allowedOrigins.length === 0) return true; // no list = allow all (e.g. dev)
  try {
    const u = new URL(origin);
    if (allowedOrigins.includes(origin)) return true;
    if (u.hostname.endsWith('.vercel.app')) return true;
    return false;
  } catch {
    return false;
  }
}

app.use(
  cors({
    origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json());
app.use(cookieParser());

// Health check proves frontend<->backend connectivity.
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
app.use('/api/projects', projectRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/ai', aiRoutes);

// Note: File uploads are now handled by Supabase Storage
// Old /uploads static serving removed - all files served from Supabase public URLs

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

    // Schema back-compat: add reactions column if missing (we don't require DB_SYNC_ALTER for this).
    try {
      await sequelize.query(
        'ALTER TABLE "elements" ADD COLUMN IF NOT EXISTS "reactions" JSONB NOT NULL DEFAULT \'{}\'::jsonb;'
      );
    } catch {
      // ignore
    }

    // Schema back-compat: user profile columns (so profile works even without DB_SYNC_ALTER).
    try {
      // Auth provider columns (Google sign-in)
      await sequelize.query('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "authProvider" VARCHAR(32) NOT NULL DEFAULT \'local\';');
      await sequelize.query('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "googleSub" VARCHAR(255);');
      await sequelize.query('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT FALSE;');
      await sequelize.query('CREATE UNIQUE INDEX IF NOT EXISTS "users_googleSub_key" ON "users" ("googleSub");');

      await sequelize.query('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "username" VARCHAR(255);');
      await sequelize.query('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "nickname" VARCHAR(255);');
      await sequelize.query('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "studyGroup" VARCHAR(255);');
      await sequelize.query('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "course" INTEGER;');
      await sequelize.query('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "faculty" VARCHAR(255);');
      await sequelize.query('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;');
      await sequelize.query('CREATE UNIQUE INDEX IF NOT EXISTS "users_username_key" ON "users" ("username");');
    } catch {
      // ignore
    }

    // Schema back-compat: group invite codes (join by code).
    // We don't require DB_SYNC_ALTER for this; keep it safe for existing DBs.
    try {
      await sequelize.query('ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "inviteCode" VARCHAR(32);');
      // Unique index allows multiple NULLs in Postgres; non-null values must be unique.
      await sequelize.query('CREATE UNIQUE INDEX IF NOT EXISTS "groups_inviteCode_key" ON "groups" ("inviteCode");');

      // Backfill legacy rows missing inviteCode.
      const [rows] = await sequelize.query(
        'SELECT "groupId" FROM "groups" WHERE "inviteCode" IS NULL OR "inviteCode" = \'\';'
      );
      const ids = Array.isArray(rows) ? rows.map((r) => Number(r.groupId)).filter((x) => Number.isFinite(x)) : [];
      for (const groupId of ids) {
        let tries = 0;
        // Try a few times to avoid rare collisions.
        while (tries < 8) {
          tries += 1;
          const code = makeInviteCode(10);
          try {
            await sequelize.query(
              'UPDATE "groups" SET "inviteCode" = :code WHERE "groupId" = :groupId AND ("inviteCode" IS NULL OR "inviteCode" = \'\');',
              { replacements: { code, groupId } }
            );
            break;
          } catch (e) {
            // Unique violation -> retry.
            const msg = String(e?.message || '');
            if (msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('unique')) continue;
            break;
          }
        }
      }
    } catch {
      // ignore
    }

    // Schema back-compat: projects + desk.projectId.
    // Keep it safe even when DB_SYNC_ALTER is off.
    try {
      await sequelize.query(
        'CREATE TABLE IF NOT EXISTS "projects" (' +
          '"projectId" SERIAL PRIMARY KEY,' +
          '"name" VARCHAR(255) NOT NULL,' +
          '"userId" INTEGER NOT NULL,' +
          '"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),' +
          '"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()' +
        ');'
      );
      await sequelize.query('CREATE INDEX IF NOT EXISTS "projects_userId_createdAt_key" ON "projects" ("userId","createdAt");');
      await sequelize.query('ALTER TABLE "desks" ADD COLUMN IF NOT EXISTS "projectId" INTEGER;');
      await sequelize.query('CREATE INDEX IF NOT EXISTS "desks_projectId_key" ON "desks" ("projectId");');
    } catch {
      // ignore
    }

    // Schema back-compat: group membership roles/status (needed for invites + join requests).
    // Keep it safe for existing DBs even if DB_SYNC_ALTER is off.
    try {
      await sequelize.query('ALTER TABLE "group_members" ADD COLUMN IF NOT EXISTS "role" VARCHAR(16) NOT NULL DEFAULT \'MEMBER\';');
      await sequelize.query('ALTER TABLE "group_members" ADD COLUMN IF NOT EXISTS "status" VARCHAR(16) NOT NULL DEFAULT \'ACTIVE\';');
      await sequelize.query(
        'CREATE UNIQUE INDEX IF NOT EXISTS "group_members_groupId_userId_key" ON "group_members" ("groupId", "userId");'
      );
      await sequelize.query('CREATE INDEX IF NOT EXISTS "group_members_groupId_status_key" ON "group_members" ("groupId", "status");');
      await sequelize.query('CREATE INDEX IF NOT EXISTS "group_members_userId_status_key" ON "group_members" ("userId", "status");');
    } catch {
      // ignore
    }

    // Schema back-compat: calendar event attachments/materials.
    // Keep safe even if DB_SYNC_ALTER is off.
    try {
      await sequelize.query(
        'ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "materials" JSONB NOT NULL DEFAULT \'[]\'::jsonb;'
      );
      await sequelize.query(
        'ALTER TABLE "calendar_my_events" ADD COLUMN IF NOT EXISTS "materials" JSONB NOT NULL DEFAULT \'[]\'::jsonb;'
      );
    } catch {
      // ignore
    }

    // Schema back-compat: rate_limits table (DB-backed, no in-memory state).
    try {
      await sequelize.query(
        'CREATE TABLE IF NOT EXISTS "rate_limits" (' +
          '"bucket_key" VARCHAR(255) PRIMARY KEY,' +
          '"count" INTEGER NOT NULL DEFAULT 0,' +
          '"reset_at" TIMESTAMP WITH TIME ZONE NOT NULL' +
        ');'
      );
    } catch {
      // ignore
    }

    // Schema back-compat: refresh_token.device_id for PWA multi-device.
    try {
      await sequelize.query('ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "deviceId" VARCHAR(255);');
      await sequelize.query('CREATE INDEX IF NOT EXISTS "refresh_tokens_user_device" ON "refresh_tokens" ("userId","deviceId");');
    } catch {
      // ignore
    }

    // Schema back-compat: material blocks (учебное хранилище на доске).
    try {
      await sequelize.query(
        'CREATE TABLE IF NOT EXISTS "material_blocks" (' +
          '"id" SERIAL PRIMARY KEY,' +
          '"boardId" INTEGER NOT NULL REFERENCES "desks"("deskId") ON DELETE CASCADE ON UPDATE CASCADE,' +
          '"title" VARCHAR(255) NOT NULL DEFAULT \'Материалы\',' +
          '"x" INTEGER NOT NULL DEFAULT 0,' +
          '"y" INTEGER NOT NULL DEFAULT 0,' +
          '"width" INTEGER NOT NULL DEFAULT 280,' +
          '"height" INTEGER NOT NULL DEFAULT 160,' +
          '"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),' +
          '"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()' +
        ');'
      );
      await sequelize.query('CREATE INDEX IF NOT EXISTS "material_blocks_board_id" ON "material_blocks" ("boardId");');
      await sequelize.query(
        'CREATE TABLE IF NOT EXISTS "material_cards" (' +
          '"id" SERIAL PRIMARY KEY,' +
          '"blockId" INTEGER NOT NULL REFERENCES "material_blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE,' +
          '"title" VARCHAR(255) NOT NULL DEFAULT \'\',' +
          '"content" TEXT NOT NULL DEFAULT \'\',' +
          '"createdBy" INTEGER REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,' +
          '"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),' +
          '"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()' +
        ');'
      );
      await sequelize.query('CREATE INDEX IF NOT EXISTS "material_cards_block_id" ON "material_cards" ("blockId");');
      await sequelize.query('CREATE INDEX IF NOT EXISTS "material_cards_block_created" ON "material_cards" ("blockId","createdAt");');
      await sequelize.query(
        'CREATE TABLE IF NOT EXISTS "material_files" (' +
          '"id" SERIAL PRIMARY KEY,' +
          '"cardId" INTEGER NOT NULL REFERENCES "material_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE,' +
          '"fileUrl" TEXT NOT NULL,' +
          '"fileType" VARCHAR(255),' +
          '"size" INTEGER,' +
          '"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),' +
          '"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()' +
        ');'
      );
      await sequelize.query('CREATE INDEX IF NOT EXISTS "material_files_card_id" ON "material_files" ("cardId");');
      await sequelize.query(
        'CREATE TABLE IF NOT EXISTS "material_links" (' +
          '"id" SERIAL PRIMARY KEY,' +
          '"cardId" INTEGER NOT NULL REFERENCES "material_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE,' +
          '"url" TEXT NOT NULL,' +
          '"title" VARCHAR(255),' +
          '"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),' +
          '"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()' +
        ');'
      );
      await sequelize.query('CREATE INDEX IF NOT EXISTS "material_links_card_id" ON "material_links" ("cardId");');
      await sequelize.query(
        'CREATE TABLE IF NOT EXISTS "material_card_tags" (' +
          '"id" SERIAL PRIMARY KEY,' +
          '"cardId" INTEGER NOT NULL REFERENCES "material_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE,' +
          '"tag" VARCHAR(255) NOT NULL,' +
          '"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),' +
          '"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),' +
          'CONSTRAINT "material_card_tags_card_id_tag_key" UNIQUE("cardId","tag")' +
        ');'
      );
      await sequelize.query('CREATE INDEX IF NOT EXISTS "material_card_tags_card_id" ON "material_card_tags" ("cardId");');
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

    const server = http.createServer(app);
    initRealtime(server);
    startCalendarNotificationWorker({ intervalMs: 60_000 });
    startRateLimitCleanup(5 * 60_000);

    server.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`Server started: http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('DB connection failed:', error.message);
  }
}

start();


