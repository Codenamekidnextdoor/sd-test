'use strict';

/**
 * RAT backend entry point.
 * Wires middleware, mounts the API routers and starts listening.
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { PORT, REPOS_DIR, DATA_DIR } = require('./config');
const { closeAll } = require('./db/connection');
const reposRouter = require('./routes/repos');
const metricsRouter = require('./routes/metrics');
const commitsRouter = require('./routes/commits');
const authorsRouter = require('./routes/authors');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Runtime directories must exist before anything else happens.
fs.mkdirSync(REPOS_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

const app = express();

app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Health probe.
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), now: Date.now() });
});

// API surface — all routers share the /api/repos prefix.
app.use('/api/repos', reposRouter);
app.use('/api/repos', metricsRouter);
app.use('/api/repos', commitsRouter);
app.use('/api/repos', authorsRouter);

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`RAT backend listening on http://localhost:${PORT}`);
});

function shutdown(signal) {
  console.log(`Received ${signal}, shutting down...`);
  const forceExit = setTimeout(() => {
    closeAll();
    process.exit(0);
  }, 3000);
  forceExit.unref();

  server.close(() => {
    clearTimeout(forceExit);
    closeAll();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = app;
