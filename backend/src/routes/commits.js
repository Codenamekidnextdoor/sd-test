'use strict';

/**
 * Commit routes:
 *   GET /api/repos/:id/commits           - paginated, filterable commit list
 *   GET /api/repos/:id/commits/:hash     - single commit with its file changes
 *
 * Query params for the list: page, limit, author, from, to, path, commits.
 */

const express = require('express');
const { getDb } = require('../db/connection');
const { sanitizeId } = require('../utils/pathUtils');
const { getRepo } = require('../services/repoRegistry');
const { parseFilters } = require('../services/metricsService');
const queries = require('../db/queries');
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

router.get('/:id/commits', asyncHandler(async (req, res) => {
  const repoId = requireRepoId(req);
  const filters = parseFilters(req.query);
  const page = req.query.page;
  const limit = req.query.limit;

  const db = getDb(repoId);
  res.json(queries.getCommitList(db, filters, page, limit));
}));

router.get('/:id/commits/:hash', asyncHandler(async (req, res) => {
  const repoId = requireRepoId(req);
  const db = getDb(repoId);
  const detail = queries.getCommitDetail(db, req.params.hash);
  if (!detail) {
    const err = new Error(`Commit '${req.params.hash}' not found`);
    err.status = 404;
    throw err;
  }
  res.json(detail);
}));

module.exports = router;
