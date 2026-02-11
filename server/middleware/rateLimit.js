// DB-backed rate limiter (no in-memory state). Survives restarts and cold start.
// For auth routes: avoids Map/process state loss on platform redeploy (e.g. Railway).

const sequelize = require('../db');

const TABLE = 'rate_limits';

async function ensureTable() {
  await sequelize.query(
    `CREATE TABLE IF NOT EXISTS "${TABLE}" (
      "bucket_key" VARCHAR(255) PRIMARY KEY,
      "count" INTEGER NOT NULL DEFAULT 0,
      "reset_at" TIMESTAMP WITH TIME ZONE NOT NULL
    );`
  );
}

function createRateLimit({ windowMs = 60_000, max = 20, keyPrefix = 'rl' } = {}) {
  let tableReady = false;

  const init = async () => {
    if (tableReady) return;
    try {
      await ensureTable();
      tableReady = true;
    } catch (e) {
      // Fallback: allow request if DB fails (avoid blocking auth).
      console.warn('rateLimit: table init failed', e?.message);
    }
  };

  return async function rateLimit(req, res, next) {
    try {
      await init();
    } catch {
      return next();
    }

    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const key = `${keyPrefix}:${ip}`;
    const now = new Date();
    const resetAt = new Date(Date.now() + windowMs);

    try {
      const [rows] = await sequelize.query(
        `INSERT INTO "${TABLE}" ("bucket_key", "count", "reset_at") VALUES (:key, 1, :resetAt)
         ON CONFLICT ("bucket_key") DO UPDATE SET
           "count" = CASE WHEN "${TABLE}"."reset_at" <= :now THEN 1 ELSE "${TABLE}"."count" + 1 END,
           "reset_at" = CASE WHEN "${TABLE}"."reset_at" <= :now THEN :resetAt ELSE "${TABLE}"."reset_at" END
         RETURNING "count", "reset_at";`,
        { replacements: { key, resetAt, now } }
      );

      const row = rows?.[0];
      if (!row) return next();

      const count = Number(row.count) || 0;
      const rowResetAt = new Date(row.reset_at);

      if (count > max) {
        const retryAfterSec = Math.ceil((new Date(rowResetAt) - Date.now()) / 1000);
        res.setHeader('Retry-After', String(Math.max(1, retryAfterSec)));
        return res.status(429).json({ error: 'Too many requests. Please try again later.' });
      }

      return next();
    } catch (e) {
      // On DB error: allow request (fail open for auth availability).
      return next();
    }
  };
}

// Periodic cleanup of expired rows (best-effort).
let cleanupInterval;
function startCleanup(intervalMs = 5 * 60_000) {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(async () => {
    try {
      await sequelize.query(`DELETE FROM "${TABLE}" WHERE "reset_at" < NOW();`);
    } catch {
      // ignore
    }
  }, intervalMs);
}

module.exports = { createRateLimit, startCleanup };
