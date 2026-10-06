'use strict';

/**
 * Author routes:
 *   GET  /api/repos/:id/authors                    - list authors (post-merge)
 *   GET  /api/repos/:id/authors/resolve            ?name=&email= - resolve an identity
 *   POST /api/repos/:id/authors/merge              - manual merge
 *        body: { canonicalName, canonicalEmail, aliases: [{ name, email }] }
 *   POST /api/repos/:id/authors/import-mailmap     - apply the repo's .mailmap
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { REPOS_DIR } = require('../config');
const { getDb } = require('../db/connection');
const { sanitizeId } = require('../utils/pathUtils');
const { getRepo } = require('../services/repoRegistry');
const queries = require('../db/queries');
const {
  mergeAuthors,
  importMailmap,
  getResolvedAuthorName
} = require('../services/authorService');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

function requireRepoId(req) {
  const id = sanitizeId(req.params.id);
  const repo = id ? getRepo(id) : null;
  if (!repo) {
    const err = new Error(`Repository '${req.params.id}' not found`);
    err.status = 404;
    throw err;
  }
  return repo.id;
}

router.get('/:id/authors', asyncHandler(async (req, res) => {
  const repoId = requireRepoId(req);
  res.json(queries.getAuthors(getDb(repoId)));
}));

router.get('/:id/authors/resolve', asyncHandler(async (req, res) => {
  const repoId = requireRepoId(req);
  const name = req.query.name != null ? String(req.query.name) : '';
  const email = req.query.email != null ? String(req.query.email) : '';
  res.json(getResolvedAuthorName(getDb(repoId), name, email));
}));

router.post('/:id/authors/merge', asyncHandler(async (req, res) => {
  const repoId = requireRepoId(req);
  const { canonicalName, canonicalEmail, aliases } = req.body || {};

  if (!canonicalName || !canonicalEmail) {
    const err = new Error('`canonicalName` and `canonicalEmail` are required');
    err.status = 400;
    throw err;
  }
  if (!Array.isArray(aliases) || aliases.length === 0) {
    const err = new Error('`aliases` must be a non-empty array of { name, email } objects');
    err.status = 400;
    throw err;
  }

  const result = mergeAuthors(
    getDb(repoId),
    String(canonicalName),
    String(canonicalEmail),
    aliases
  );

  res.json({
    ok: true,
    canonicalName,
    canonicalEmail,
    aliasesAdded: result.aliasesAdded,
    commitsUpdated: result.commitsUpdated
  });
}));

router.post('/:id/authors/import-mailmap', asyncHandler(async (req, res) => {
  const repoId = requireRepoId(req);
  const repoPath = path.join(REPOS_DIR, repoId);

  if (!fs.existsSync(path.join(repoPath, '.git'))) {
    const err = new Error('Repository checkout is missing — re-ingest the repository first');
    err.status = 400;
    throw err;
  }

  const result = importMailmap(getDb(repoId), repoPath);
  res.json({ ok: true, ...result });
}));

module.exports = router;
