'use strict';

/**
 * Lightweight registry of ingested repositories, persisted as
 * DATA_DIR/repos.json. Keeps listing cheap and survives restarts without
 * touching the per-repo SQLite files.
 *
 * All operations are synchronous and read-modify-write, which is fine for
 * the single-process Express server this backend runs as.
 */

const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config');

const INDEX_PATH = path.join(DATA_DIR, 'repos.json');

function readIndex() {
  try {
    if (!fs.existsSync(INDEX_PATH)) return [];
    const parsed = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.repos)) return parsed.repos;
    return [];
  } catch (err) {
    // Corrupt index — start over rather than taking the whole API down.
    console.warn(`[repoRegistry] could not read ${INDEX_PATH}: ${err.message}`);
    return [];
  }
}

function writeIndex(repos) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmpPath = `${INDEX_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(repos, null, 2));
  fs.renameSync(tmpPath, INDEX_PATH);
}

/** All registered repos, most recently added first. */
function listRepos() {
  return readIndex();
}

/** A single registry entry by id, or null. */
function getRepo(id) {
  return readIndex().find((repo) => repo.id === id) || null;
}

/** Insert or update an entry; returns the stored entry. */
function addRepo(entry) {
  const repos = readIndex();
  const idx = repos.findIndex((repo) => repo.id === entry.id);
  if (idx >= 0) {
    repos[idx] = { ...repos[idx], ...entry };
  } else {
    repos.unshift(entry);
  }
  writeIndex(repos);
  return entry;
}

/** Remove an entry; returns true when something was removed. */
function removeRepo(id) {
  const repos = readIndex();
  const next = repos.filter((repo) => repo.id !== id);
  if (next.length === repos.length) return false;
  writeIndex(next);
  return true;
}

module.exports = {
  INDEX_PATH,
  listRepos,
  getRepo,
  addRepo,
  removeRepo
};
