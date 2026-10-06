'use strict';

/**
 * Repository management routes:
 *   POST   /api/repos/clone   - clone a remote URL and ingest it
 *   POST   /api/repos/upload  - upload a zip (with .git) and ingest it
 *   GET    /api/repos         - list ingested repositories
 *   GET    /api/repos/:id     - repository details
 *   GET    /api/repos/:id/tree - immediate children of a directory, with metrics
 *   DELETE /api/repos/:id     - remove the checkout and all derived data
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { REPOS_DIR, DATA_DIR } = require('../config');
const { closeDb, getDb } = require('../db/connection');
const { sanitizeId } = require('../utils/pathUtils');
const { ingestFromUrl, ingestFromZip, getIngestProgress } = require('../services/ingestion');
const { addRepo, listRepos, getRepo, removeRepo } = require('../services/repoRegistry');
const { parseFilters } = require('../services/metricsService');
const queries = require('../db/queries');
const { asyncHandler } = require('../middleware/errorHandler');
const upload = require('../middleware/upload');

const router = express.Router();

/** Derive a display name from a clone URL, e.g. .../foo/bar.git -> bar. */
function deriveName(url) {
  const clean = String(url).replace(/\/+$/, '').replace(/\.git$/i, '');
  const segments = clean.split(/[/\\:]/).filter(Boolean);
  return segments.pop() || 'repo';
}

/** Remove a repo's working tree and derived database files. */
function cleanupRepo(repoId) {
  closeDb(repoId);
  fs.rmSync(path.join(REPOS_DIR, repoId), { recursive: true, force: true });
  fs.rmSync(path.join(REPOS_DIR, `.extract-${repoId}`), { recursive: true, force: true });
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(path.join(DATA_DIR, `${repoId}.db${suffix}`), { force: true });
  }
}

function requireRepo(req) {
  const id = sanitizeId(req.params.id);
  const repo = id ? getRepo(id) : null;
  if (!repo) {
    const err = new Error(`Repository '${req.params.id}' not found`);
    err.status = 404;
    throw err;
  }
  return repo;
}

// POST /api/repos/clone
router.post('/clone', asyncHandler(async (req, res) => {
  const { url, name } = req.body || {};
  if (!url || typeof url !== 'string' || !url.trim()) {
    const err = new Error('`url` is required');
    err.status = 400;
    throw err;
  }

  const repoId = uuidv4();
  const trimmedUrl = url.trim();

  try {
    const stats = await ingestFromUrl(repoId, trimmedUrl);
    const entry = addRepo({
      id: repoId,
      name: name && String(name).trim() ? String(name).trim() : deriveName(trimmedUrl),
      source: 'url',
      url: trimmedUrl,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      commitCount: stats.commitCount,
      fileChangeCount: stats.fileChangeCount,
      authorCount: stats.authorCount
    });
    res.status(201).json(entry);
  } catch (err) {
    cleanupRepo(repoId);
    throw err;
  }
}));

// POST /api/repos/upload  (multipart/form-data, field name: `file`)
router.post('/upload', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) {
    const err = new Error('No file uploaded — send a .zip archive in the `file` field');
    err.status = 400;
    throw err;
  }

  const repoId = uuidv4();
  const fallbackName = String(req.file.originalname || 'repo').replace(/\.zip$/i, '') || 'repo';
  const requestedName = req.body && req.body.name ? String(req.body.name).trim() : '';

  try {
    const stats = await ingestFromZip(repoId, req.file.path);
    const entry = addRepo({
      id: repoId,
      name: requestedName || fallbackName,
      source: 'zip',
      url: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      commitCount: stats.commitCount,
      fileChangeCount: stats.fileChangeCount,
      authorCount: stats.authorCount
    });
    res.status(201).json(entry);
  } catch (err) {
    cleanupRepo(repoId);
    throw err;
  } finally {
    // ingestion removes the temp zip on success; make sure failures do too
    fs.rm(req.file.path, { force: true }, () => {});
  }
}));

// GET /api/repos
router.get('/', (req, res) => {
  const repos = listRepos().map((repo) => {
    // Backfill authorCount for repos registered before the field existed,
    // so every list response carries it (persisted once it is computed).
    if (repo && repo.id && repo.authorCount == null
        && fs.existsSync(path.join(DATA_DIR, `${repo.id}.db`))) {
      try {
        const updated = { ...repo, authorCount: queries.getAuthorCount(getDb(repo.id)) };
        addRepo(updated);
        return updated;
      } catch (err) {
        // An unreadable database must never break the listing.
      }
    }
    return repo;
  });
  res.json(repos);
});

// GET /api/repos/:id
router.get('/:id', (req, res) => {
  res.json(requireRepo(req));
});

// GET /api/repos/:id/status  (ingestion progress for the current process)
router.get('/:id/status', (req, res) => {
  const repo = requireRepo(req);
  const progress = getIngestProgress(repo.id);
  res.json({
    id: repo.id,
    name: repo.name,
    commitCount: repo.commitCount,
    fileChangeCount: repo.fileChangeCount,
    progress
  });
});

// GET /api/repos/:id/tree  (immediate children of ?path=, root by default;
// accepts the same filter params as /metrics: author, from, to, commits)
router.get('/:id/tree', asyncHandler(async (req, res) => {
  const repo = requireRepo(req);
  const filters = parseFilters(req.query);
  res.json(queries.getDirectoryTree(getDb(repo.id), filters.path, filters));
}));

// DELETE /api/repos/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const repo = requireRepo(req);
  removeRepo(repo.id);
  cleanupRepo(repo.id);
  res.status(204).end();
}));

module.exports = router;
