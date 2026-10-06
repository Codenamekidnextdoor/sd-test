'use strict';

/**
 * Per-repo SQLite connection management.
 *
 * Every ingested repository gets its own database file at
 * DATA_DIR/<repoId>.db. Connections are cached in-process so that repeated
 * API calls reuse the same handle with its prepared state.
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { DATA_DIR } = require('../config');
const { sanitizeId } = require('../utils/pathUtils');

const SCHEMA_PATH = path.join(__dirname, 'schema.sql');
const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf8');

/** @type {Map<string, import('better-sqlite3').Database>} */
const connections = new Map();

function dbPathFor(repoId) {
  return path.join(DATA_DIR, `${sanitizeId(repoId)}.db`);
}

/**
 * Open (or return the cached) SQLite database for a repo and make sure the
 * schema exists.
 */
function getDb(repoId) {
  const id = sanitizeId(repoId);
  if (!id) {
    const err = new Error('Invalid repo id');
    err.status = 400;
    throw err;
  }

  const cached = connections.get(id);
  if (cached) return cached;

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(dbPathFor(id));
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -64000');
  db.pragma('foreign_keys = ON');
  db.exec(schemaSql);

  // Composite indexes added after the first schema release: schema.sql covers
  // freshly created databases, and this explicit exec makes sure existing
  // database files gain the new indexes too (CREATE INDEX IF NOT EXISTS is
  // idempotent, so running both is safe).
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_fc_commit_path ON file_changes(commit_hash, file_path);
    CREATE INDEX IF NOT EXISTS idx_fc_path_added_removed ON file_changes(file_path, lines_added, lines_removed);
    CREATE INDEX IF NOT EXISTS idx_commits_ts_author ON commits(timestamp, author_email);
  `);

  // Migration: databases created before the commits.message column existed
  // must gain it explicitly — CREATE TABLE IF NOT EXISTS is a no-op on an
  // existing table.
  const commitColumns = db.pragma('table_info(commits)');
  if (!commitColumns.some((column) => column.name === 'message')) {
    db.exec('ALTER TABLE commits ADD COLUMN message TEXT');
  }

  connections.set(id, db);
  return db;
}

/** Close and evict a single repo connection (does not delete the file). */
function closeDb(repoId) {
  const id = sanitizeId(repoId);
  const db = connections.get(id);
  if (!db) return;
  try {
    db.close();
  } finally {
    connections.delete(id);
  }
}

/** Close every open connection (called on shutdown). */
function closeAll() {
  for (const db of connections.values()) {
    try {
      db.close();
    } catch (err) {
      // ignore — we are shutting down anyway
    }
  }
  connections.clear();
}

module.exports = { getDb, closeDb, closeAll, dbPathFor };
