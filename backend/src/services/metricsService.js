'use strict';

/**
 * metricsService — thin wrapper that binds the query layer to the right
 * per-repo database handle and normalizes incoming filter params.
 */

const { getDb } = require('../db/connection');
const queries = require('../db/queries');

const VALID_TYPES = [
  'file',
  'directory',
  'repo',
  'commitset',
  'author',
  'tree',
  'churn-timeseries',
  'commit-activity'
];

// Convenience aliases so paths like /metrics/repository or /metrics/commit-set
// (see the project README API table) also work.
const TYPE_ALIASES = {
  repository: 'repo',
  'commit-set': 'commitset',
  commits: 'commitset',
  files: 'file',
  directorys: 'directory',
  directories: 'directory',
  authors: 'author',
  tree: 'tree'
};

function normalizeType(type) {
  const t = String(type || 'file').toLowerCase().trim();
  return TYPE_ALIASES[t] || t;
}

/**
 * Accepts unix seconds or milliseconds and always returns seconds
 * (the unit git stores in the commits table).
 */
function toUnixSeconds(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
}

/**
 * Split a query param into a list of non-empty strings. Accepts a repeated
 * param (array), a JSON array string, or a comma separated string.
 * Returns null when the param is absent/empty.
 */
function parseListParam(raw) {
  if (raw == null || raw === '') return null;
  const values = Array.isArray(raw) ? raw : [raw];
  const tokens = [];
  for (const value of values) {
    if (value == null) continue;
    const s = String(value).trim();
    if (!s) continue;
    if (s.startsWith('[')) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) {
          tokens.push(
            ...parsed.map((item) => String(item).trim()).filter(Boolean)
          );
          continue;
        }
      } catch (err) {
        // fall through to comma splitting
      }
    }
    tokens.push(...s.split(',').map((token) => token.trim()).filter(Boolean));
  }
  return tokens.length > 0 ? tokens : null;
}

/**
 * Build a `filters` object from Express query params.
 * Accepts `author` and `commits` as comma separated lists, JSON array
 * strings, or repeated query params (e.g. `?author=a&author=b`).
 * `author` is returned as an array of names/emails (null when unset).
 */
function parseFilters(query = {}) {
  const authors = parseListParam(query.author);
  const commits = parseListParam(query.commits);

  // A single path is expected; with a repeated ?path=a&path=b take the first
  // instead of coercing the array to the string "a,b" (which matches nothing).
  const rawPath = Array.isArray(query.path) ? query.path[0] : query.path;

  return {
    author: authors,
    from: toUnixSeconds(query.from),
    to: toUnixSeconds(query.to),
    path: rawPath != null ? String(rawPath) : '',
    commits: commits ? commits.slice(0, 5000) : null
  };
}

/**
 * Run the metric query matching `type` for a repo.
 *
 * Types:
 *   file              - per-file metrics (path filter narrows the set)
 *   directory         - recursive metrics of one directory (filters.path)
 *   repo              - directory metrics at the repository root
 *   commitset         - aggregates + modification frequency / churn rate
 *   author            - per-author metrics with ownership
 *   tree              - immediate children of filters.path with metrics
 *   churn-timeseries  - monthly added/removed/growth/churn buckets
 *   commit-activity   - monthly commit counts
 */
function getMetrics(repoId, type, filters = {}, options = {}) {
  const normalized = normalizeType(type);
  if (!VALID_TYPES.includes(normalized)) {
    const err = new Error(
      `Invalid metrics type '${type}'. Valid types: ${VALID_TYPES.join(', ')}`
    );
    err.status = 400;
    throw err;
  }

  const db = getDb(repoId);
  switch (normalized) {
    case 'file':
      // options carries the server-side pagination params (page, limit).
      return queries.getFileMetrics(db, filters, options.page, options.limit);
    case 'directory':
      return queries.getDirectoryMetrics(db, filters.path, filters);
    case 'repo':
      return queries.getRepoMetrics(db, filters);
    case 'commitset':
      return queries.getCommitSetMetrics(db, filters);
    case 'author':
      return queries.getAuthorMetrics(db, filters);
    case 'tree':
      return queries.getDirectoryTree(db, filters.path, filters);
    case 'churn-timeseries':
      return queries.getChurnTimeseries(db, filters);
    case 'commit-activity':
      return queries.getCommitActivity(db, filters);
    /* istanbul ignore next */
    default: {
      const err = new Error(`Unsupported metrics type '${normalized}'`);
      err.status = 400;
      throw err;
    }
  }
}

module.exports = {
  VALID_TYPES,
  normalizeType,
  toUnixSeconds,
  parseFilters,
  getMetrics
};
