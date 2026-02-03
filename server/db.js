const { Sequelize } = require('sequelize');

const logging = process.env.SEQUELIZE_LOGGING === 'true' ? console.log : false;
const pool = {
  max: Math.min(Math.max(Number(process.env.DB_POOL_MAX || 10), 1), 50),
  min: 0,
  idle: 10_000,
  acquire: 30_000,
};

// Render/managed Postgres обычно отдаёт DATABASE_URL и требует SSL.
// Локально можно продолжать использовать DB_* переменные.
const databaseUrl = process.env.DATABASE_URL;

module.exports = databaseUrl
  ? new Sequelize(databaseUrl, {
      dialect: 'postgres',
      logging,
      pool,
      dialectOptions: {
        ssl: {
          rejectUnauthorized: false,
        },
      },
    })
  : new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
      dialect: 'postgres',
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      logging,
      pool,
    });