'use strict';

/**
 * Ingestion orchestration: turn a remote URL or an uploaded zip into rows
 * in the per-repo SQLite database.
 *
 * Pipeline: clone/extract -> git log -> streaming parse -> batched inserts
 * (better-sqlite3 transactions, BATCH_SIZE commits per batch).
 */

const fs = require('fs');
const path = require('path');
const unzipper = require('unzipper');
const { REPOS_DIR, BATCH_SIZE } = require('../config');
const { getDb } = require('../db/connection');
const queries = require('../db/queries');
const { cloneRepo, getGitLog, isGitRepo } = require('./gitCommands');
const { parseGitLog } = require('./gitParser');

/**
 * In-memory ingestion progress, keyed by repo id, so long ingestions can be
 * observed while they run.
 */
const progressByRepo = new Map();

function updateProgress(repoId, patch, onProgress) {
  const current = progressByRepo.get(repoId) || {
    repoId,
    phase: 'pending',
    commits: 0,
    fileChanges: 0,
    startedAt: Date.now(),
    finishedAt: null,
    error: null
  };
  Object.assign(current, patch);
  progressByRepo.set(repoId, current);
  if (typeof onProgress === 'function') {
    try {
      onProgress({ ...current });
    } catch (err) {
      // progress callbacks must never break ingestion
    }
  }
  return current;
}

/** Latest progress snapshot for a repo, or null. */
function getIngestProgress(repoId) {
  return progressByRepo.get(repoId) || null;
}

/**
 * Locate the git repository root inside an extraction directory. Handles
 * zips that wrap the repo in one or two top-level folders (GitHub-style
 * archives, "zip the folder" exports, ...).
 */
function findGitRoot(dir, depth = 0) {
  if (isGitRepo(dir)) return dir;
  if (depth >= 2) return null;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const found = findGitRoot(path.join(dir, entry.name), depth + 1);
    if (found) return found;
  }
  return null;
}

/**
 * Core ingestion: stream `git log` of `repoPath` into the database for
 * `repoId`. Wipes any previous data for the repo first (idempotent
 * re-ingestion).
 */
async function ingestRepo(repoId, repoPath, options = {}) {
  const { onProgress } = options;

  if (!isGitRepo(repoPath)) {
    const err = new Error(`Not a git repository (no .git found): ${repoPath}`);
    err.status = 400;
    throw err;
  }

  const db = getDb(repoId);

  const insertCommit = db.prepare(`
    INSERT OR REPLACE INTO commits (hash, author_name, author_email, timestamp, parent_count, message)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertChange = db.prepare(`
    INSERT INTO file_changes (commit_hash, file_path, lines_added, lines_removed, rename_from)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertBatch = db.transaction((batch) => {
    for (const commit of batch) {
      insertCommit.run(
        commit.hash,
        commit.authorName,
        commit.authorEmail,
        commit.timestamp,
        commit.parentCount,
        commit.message || null
      );
      for (const file of commit.files) {
        insertChange.run(
          commit.hash,
          file.path,
          file.added,
          file.removed,
          file.renameFrom || null
        );
      }
    }
  });

  // Fresh start for this repo (re-ingest replaces history).
  db.prepare('DELETE FROM file_changes').run();
  db.prepare('DELETE FROM commits').run();

  updateProgress(repoId, { phase: 'parsing', commits: 0, fileChanges: 0, startedAt: Date.now(), error: null }, onProgress);

  const stream = getGitLog(repoPath);
  let commitCount = 0;
  let fileChangeCount = 0;
  let batch = [];

  for await (const commit of parseGitLog(stream)) {
    batch.push(commit);
    commitCount += 1;
    fileChangeCount += commit.files.length;

    if (batch.length >= BATCH_SIZE) {
      insertBatch(batch);
      batch = [];
      updateProgress(repoId, { phase: 'parsing', commits: commitCount, fileChanges: fileChangeCount }, onProgress);
    }
  }

  if (batch.length > 0) {
    insertBatch(batch);
    batch = [];
  }

  // Make sure the git process finished and surface its exit status.
  const exit = await (stream.gitExit || Promise.resolve({ code: 0, stderr: '' }));
  if (exit.code !== 0) {
    const message = (exit.stderr || '').trim().split('\n').slice(-2).join(' ') || `exit code ${exit.code}`;
    if (commitCount === 0) {
      const err = new Error(`git log failed: ${message}`);
      err.status = 400;
      throw err;
    }
    console.warn(`[ingestion] git log for ${repoId} exited with ${exit.code} after ${commitCount} commits: ${message}`);
  }

  // Author count for the registry (listings stay DB-free).
  const authorCount = queries.getAuthorCount(db);

  const finished = updateProgress(repoId, {
    phase: 'done',
    commits: commitCount,
    fileChanges: fileChangeCount,
    finishedAt: Date.now()
  }, onProgress);

  return {
    repoId,
    repoPath,
    commitCount,
    fileChangeCount,
    authorCount,
    finishedAt: finished.finishedAt
  };
}

/**
 * Clone a repository from a URL and ingest its history.
 */
async function ingestFromUrl(repoId, url, options = {}) {
  fs.mkdirSync(REPOS_DIR, { recursive: true });
  const dest = path.join(REPOS_DIR, repoId);

  updateProgress(repoId, { phase: 'cloning', startedAt: Date.now(), commits: 0, fileChanges: 0, error: null }, options.onProgress);

  try {
    await cloneRepo(url, dest);
    return await ingestRepo(repoId, dest, options);
  } catch (err) {
    updateProgress(repoId, { phase: 'error', error: err.message, finishedAt: Date.now() }, options.onProgress);
    throw err;
  }
}

/**
 * Extract an uploaded zip (which must contain a .git directory), then
 * ingest its history. The uploaded zip is removed afterwards; a temporary
 * extraction directory is always cleaned up.
 */
async function ingestFromZip(repoId, zipPath, options = {}) {
  fs.mkdirSync(REPOS_DIR, { recursive: true });
  const extractDir = path.join(REPOS_DIR, `.extract-${repoId}`);
  const dest = path.join(REPOS_DIR, repoId);

  updateProgress(repoId, { phase: 'extracting', startedAt: Date.now(), commits: 0, fileChanges: 0, error: null }, options.onProgress);

  try {
    await fs.promises.rm(extractDir, { recursive: true, force: true });
    await fs.promises.mkdir(extractDir, { recursive: true });

    // Use the Open/extract API (not pipe + 'close') — the piped stream can
    // emit 'close' before every entry has been flushed to disk, which would
    // silently truncate the .git directory.
    const zip = await unzipper.Open.file(zipPath);
    await zip.extract({ path: extractDir });

    const repoRoot = findGitRoot(extractDir);
    if (!repoRoot) {
      const err = new Error('Uploaded zip does not contain a .git directory — export the repository with its history (e.g. `zip -r repo.zip repo/` including the .git folder).');
      err.status = 400;
      throw err;
    }

    await fs.promises.rm(dest, { recursive: true, force: true });
    await fs.promises.cp(repoRoot, dest, { recursive: true });

    return await ingestRepo(repoId, dest, options);
  } catch (err) {
    updateProgress(repoId, { phase: 'error', error: err.message, finishedAt: Date.now() }, options.onProgress);
    throw err;
  } finally {
    await fs.promises.rm(extractDir, { recursive: true, force: true }).catch(() => {});
    await fs.promises.rm(zipPath, { force: true }).catch(() => {});
  }
}

module.exports = {
  ingestRepo,
  ingestFromUrl,
  ingestFromZip,
  getIngestProgress,
  findGitRoot
};
