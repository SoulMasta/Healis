const { Sequelize } = require('sequelize');

module.exports = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
  dialect: 'postgres',
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  logging: process.env.SEQUELIZE_LOGGING === 'true' ? console.log : false,
  pool: {
    max: Math.min(Math.max(Number(process.env.DB_POOL_MAX || 10), 1), 50),
    min: 0,
    idle: 10_000,
    acquire: 30_000,
  },
});