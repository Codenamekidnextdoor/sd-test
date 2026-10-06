'use strict';

/**
 * Path helpers shared across the backend.
 *
 * Repository-relative paths are always stored and queried in a normalized
 * POSIX form: forward slashes, no leading './' or '/', no '..' segments,
 * no trailing slash. The root of the repository is the empty string ''.
 */

const path = require('path');

/**
 * Normalize a repository-relative path to POSIX form.
 * Returns '' for the repository root.
 */
function normalizeRelativePath(p) {
  if (p == null) return '';
  let s = String(p).replace(/\\/g, '/').trim();
  s = s.replace(/^(\.\/)+/, '');
  s = s.replace(/^\/+/, '');
  const parts = [];
  for (const segment of s.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      parts.pop();
      continue;
    }
    parts.push(segment);
  }
  return parts.join('/');
}

/**
 * Directory containing the given file path.
 * 'src/lib/a.js' -> 'src/lib'; 'a.js' -> '' (root).
 */
function getDirectory(filePath) {
  const normalized = normalizeRelativePath(filePath);
  const idx = normalized.lastIndexOf('/');
  return idx === -1 ? '' : normalized.slice(0, idx);
}

/**
 * True when `child` is `parent` itself or lives underneath it.
 * The root ('') contains every path.
 */
function isSubPath(parent, child) {
  const p = normalizeRelativePath(parent);
  const c = normalizeRelativePath(child);
  if (p === '') return true;
  return c === p || c.startsWith(`${p}/`);
}

/**
 * Resolve a user supplied relative path against a base directory, refusing
 * to escape it (protects against '../' traversal in route parameters).
 */
function safeResolve(baseDir, relative) {
  const normalized = normalizeRelativePath(relative);
  const base = path.resolve(baseDir);
  const resolved = path.resolve(base, normalized);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error(`Path escapes base directory: ${relative}`);
  }
  return resolved;
}

/**
 * Sanitize identifiers (repo ids) for safe use inside file names.
 * Strips anything that could be used for path traversal.
 */
function sanitizeId(id) {
  return String(id == null ? '' : id)
    .replace(/\.\./g, '')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 128);
}

/**
 * Collapse duplicate slashes produced e.g. when reconstructing rename paths
 * from git's brace notation ('src//file.js' -> 'src/file.js').
 */
function collapseSlashes(p) {
  return String(p).replace(/\/{2,}/g, '/');
}

module.exports = {
  normalizeRelativePath,
  getDirectory,
  isSubPath,
  safeResolve,
  sanitizeId,
  collapseSlashes
};
