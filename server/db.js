const { Sequelize } = require('sequelize');

const logging = process.env.SEQUELIZE_LOGGING === 'true' ? console.log : false;
const pool = {
  max: Math.min(Math.max(Number(process.env.DB_POOL_MAX || 10), 1), 50),
  min: 0,
  idle: 10_000,
  acquire: 30_000,
};

// Strategy:
// - If explicit DB_HOST is provided, prefer DB_* variables (works for local and
//   docker setups where DB_HOST is set to the correct hostname).
// - Otherwise, if DATABASE_URL is present, use it (common for managed DB URLs).
// This avoids accidentally using a DATABASE_URL that points to an unresolved
// service name like "postgres" when the network doesn't provide that DNS entry.
const databaseUrl = process.env.DATABASE_URL;
const hasDbHost = Boolean(process.env.DB_HOST);

if (hasDbHost && databaseUrl) {
  // Helpful log for operators/debugging.
  console.error('[DB] DB_HOST provided — preferring DB_* variables over DATABASE_URL');
}

const useDatabaseUrl = !!databaseUrl && !hasDbHost;

if (useDatabaseUrl) {
  module.exports = new Sequelize(databaseUrl, {
    dialect: 'postgres',
    logging,
    pool,
    dialectOptions: {
      ssl: {
        rejectUnauthorized: false,
      },
    },
  });
} else {
  const dbName = process.env.DB_NAME || 'postgres';
  const dbUser = process.env.DB_USER || 'postgres';
  const dbPassword = process.env.DB_PASSWORD || '';
  const dbHost = process.env.DB_HOST || 'localhost';
  const dbPort = Number(process.env.DB_PORT || 5432);

  module.exports = new Sequelize(dbName, dbUser, dbPassword, {
    dialect: 'postgres',
    host: dbHost,
    port: dbPort,
    logging,
    pool,
  });
}