process.env.VERCEL = process.env.VERCEL || '1';
const app = require('../dist/server');

module.exports = app;

