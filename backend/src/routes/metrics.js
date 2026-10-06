'use strict';

/**
 * Metrics routes:
 *   GET /api/repos/:id/metrics                  ?type=file|directory|repo|commitset|author|tree|churn-timeseries|commit-activity
 *   GET /api/repos/:id/metrics/:type            (path-style convenience alias)
 *
 * Common query params (see metricsService.parseFilters):
 *   path    - repository-relative path prefix
 *   author  - author name or email (aliases are resolved)
 *   from/to - unix seconds or milliseconds
 *   commits - comma separated commit hashes or a JSON array string
 *
 * Pagination params (type=file, server-side pagination):
 *   page  - 1-based page number (default 1)
 *   limit - rows per page (default 100, max 500)
 */

const express = require('express');
const { sanitizeId } = require('../utils/pathUtils');
const { getRepo } = require('../services/repoRegistry');
const { getMetrics, parseFilters } = require('../services/metricsService');
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

function handleMetrics(req, res) {
  const repoId = requireRepoId(req);
  const type = req.params.typeName || req.query.type || 'file';
  const filters = parseFilters(req.query);
  // Server-side pagination params, consumed by the file metrics type.
  const { page, limit } = req.query;
  const result = getMetrics(repoId, type, filters, { page, limit });
  res.json(result);
}

router.get('/:id/metrics', asyncHandler(handleMetrics));
router.get('/:id/metrics/:typeName', asyncHandler(handleMetrics));

module.exports = router;
