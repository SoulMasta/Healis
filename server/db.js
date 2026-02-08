const { Sequelize } = require('sequelize');

const logging = process.env.SEQUELIZE_LOGGING === 'true' ? console.log : false;
const pool = {
  max: Math.min(Math.max(Number(process.env.DB_POOL_MAX || 10), 1), 50),
  min: 0,
  idle: 10_000,
  acquire: 30_000,
};

// Production (Render): используем DATABASE_URL. Development: локальные DB_*.
const isProduction = process.env.NODE_ENV === 'production';
const databaseUrl = process.env.DATABASE_URL;

const useProductionDb = isProduction && databaseUrl;

module.exports = useProductionDb
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