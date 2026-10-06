'use strict';

/**
 * RAT metric queries.
 *
 * Formula reference (project README):
 *   added         l+_{H,o} = SUM(lines_added)
 *   removed       l-_{H,o} = SUM(lines_removed)
 *   growth        delta    = added - removed
 *   churn         lambda   = added + removed
 *   modifications n_{H,o}  = COUNT(DISTINCT commits in H that changed o)
 *   mod frequency eta      = modifications / |H|
 *   churn rate    rho      = churn / |H|
 *   ownership     omega    = authorChurn / totalChurn
 * where H is the commit set selected by the filters.
 *
 * Every exported function accepts a `filters` object:
 *   {
 *     author  - author name/email, or an array of names/emails; aliases
 *               resolve through author_aliases
 *     from    - inclusive lower bound on commit timestamp (unix seconds)
 *     to      - inclusive upper bound on commit timestamp (unix seconds)
 *     path    - repository-relative path prefix ('' = whole repo)
 *     commits - array of commit hashes restricting the commit set
 *   }
 */

const { normalizeRelativePath } = require('../utils/pathUtils');

/** Round to 4 decimal places to avoid float artifacts in JSON output. */
function round4(value) {
  const n = Number(value) || 0;
  return Math.round(n * 10000) / 10000;
}

/** Escape LIKE wildcards so paths such as `a_b.js` match literally. */
function escapeLike(value) {
  return String(value).replace(/([\\%_])/g, '\\$1');
}

/**
 * Build a WHERE clause (referencing aliases `fc` = file_changes and
 * `c` = commits) for the given filters.
 *
 * options:
 *   includePath   - apply the `path` prefix filter (default true)
 *   includeCommits- apply the commit-hash list filter (default true)
 *   commitColumn  - column used for the commit list filter
 *                   ('fc.commit_hash' when file_changes is joined,
 *                    'c.hash' for commits-only queries)
 */
function buildFilterClause(filters = {}, options = {}) {
  const {
    includePath = true,
    includeCommits = true,
    commitColumn = 'fc.commit_hash'
  } = options;
  const f = filters || {};
  const clauses = [];
  const params = [];

  if (f.author) {
    // A single author matches directly or through a recorded alias mapping
    // (alias -> canonical); multiple authors combine the same match with IN.
    const authors = (Array.isArray(f.author) ? f.author : [f.author])
      .map((value) => String(value).trim())
      .filter(Boolean);

    if (authors.length === 1) {
      clauses.push(
        `(c.author_name = ? OR c.author_email = ?
          OR EXISTS (
            SELECT 1 FROM author_aliases aa
            WHERE (aa.alias_email = ? OR (aa.alias_name != '' AND aa.alias_name = ?))
              AND (aa.canonical_email = c.author_email OR aa.canonical_name = c.author_name)
          ))`
      );
      params.push(authors[0], authors[0], authors[0], authors[0]);
    } else if (authors.length > 1) {
      const placeholders = authors.map(() => '?').join(', ');
      clauses.push(
        `(c.author_name IN (${placeholders}) OR c.author_email IN (${placeholders})
          OR EXISTS (
            SELECT 1 FROM author_aliases aa
            WHERE (aa.alias_email IN (${placeholders}) OR (aa.alias_name != '' AND aa.alias_name IN (${placeholders})))
              AND (aa.canonical_email = c.author_email OR aa.canonical_name = c.author_name)
          ))`
      );
      params.push(...authors, ...authors, ...authors, ...authors);
    }
  }

  if (f.from != null && f.from !== '') {
    clauses.push('c.timestamp >= ?');
    params.push(Number(f.from));
  }

  if (f.to != null && f.to !== '') {
    clauses.push('c.timestamp <= ?');
    params.push(Number(f.to));
  }

  if (includePath) {
    const path = normalizeRelativePath(f.path);
    if (path) {
      clauses.push("(fc.file_path = ? OR fc.file_path LIKE ? ESCAPE '\\')");
      params.push(path, `${escapeLike(path)}/%`);
    }
  }

  if (includeCommits && Array.isArray(f.commits) && f.commits.length > 0) {
    const placeholders = f.commits.map(() => '?').join(', ');
    clauses.push(`${commitColumn} IN (${placeholders})`);
    params.push(...f.commits.map(String));
  }

  return {
    where: clauses.length ? `WHERE ${clauses.join('\n    AND ')}` : '',
    params
  };
}

/**
 * File metrics: one row per file touched by the commit set.
 * Server-side paginated — returns { data, total, page, limit, pages }.
 */
function getFileMetrics(db, filters = {}, page = 1, limit = 100) {
  const p = Math.max(parseInt(page, 10) || 1, 1);
  const l = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
  const offset = (p - 1) * l;
  const { where, params } = buildFilterClause(filters);

  const fromJoin = `
    FROM file_changes fc
    JOIN commits c ON c.hash = fc.commit_hash
    ${where}
  `;

  // Total number of distinct files in scope (pagination metadata).
  const total = db
    .prepare(
      `
    SELECT COUNT(*) AS n FROM (
      SELECT fc.file_path
      ${fromJoin}
      GROUP BY fc.file_path
    )
  `
    )
    .get(...params).n;

  const data = db
    .prepare(
      `
    SELECT
      fc.file_path,
      COALESCE(SUM(fc.lines_added), 0) AS added,
      COALESCE(SUM(fc.lines_removed), 0) AS removed,
      COALESCE(SUM(fc.lines_added - fc.lines_removed), 0) AS growth,
      COALESCE(SUM(fc.lines_added + fc.lines_removed), 0) AS churn,
      COUNT(DISTINCT fc.commit_hash) AS modifications,
      MAX(c.timestamp) AS last_modified
    ${fromJoin}
    GROUP BY fc.file_path
    ORDER BY churn DESC, fc.file_path ASC
    LIMIT ? OFFSET ?
  `
    )
    .all(...params, l, offset);

  return {
    data,
    total,
    page: p,
    limit: l,
    pages: Math.max(Math.ceil(total / l), 1)
  };
}

/**
 * Directory metrics: recursive aggregation of every file underneath
 * `dirPath` (git directory semantics — the whole subtree).
 */
function getDirectoryMetrics(db, dirPath, filters = {}) {
  const path = normalizeRelativePath(dirPath);
  const scoped = { ...filters, path };
  const { where, params } = buildFilterClause(scoped);
  const sql = `
    SELECT
      COALESCE(SUM(fc.lines_added), 0) AS added,
      COALESCE(SUM(fc.lines_removed), 0) AS removed,
      COALESCE(SUM(fc.lines_added - fc.lines_removed), 0) AS growth,
      COALESCE(SUM(fc.lines_added + fc.lines_removed), 0) AS churn,
      COUNT(DISTINCT fc.commit_hash) AS modifications,
      COUNT(DISTINCT fc.file_path) AS file_count,
      MAX(c.timestamp) AS last_modified
    FROM file_changes fc
    JOIN commits c ON c.hash = fc.commit_hash
    ${where}
  `;
  const row = db.prepare(sql).get(...params);
  return { path, ...row };
}

/**
 * Repository metrics: directory metrics evaluated at the root.
 *
 * The `path` filter still applies: repo metrics are the recursive metrics of
 * the repository root subtree, which `filters.path` narrows. Passing it as
 * the directory scope (instead of a hard-coded '') keeps every metric type
 * consistent — with `path=tests`, the repo totals equal the tests/ directory
 * totals, matching the README's contract that `path` is a common filter.
 */
function getRepoMetrics(db, filters = {}) {
  return getDirectoryMetrics(db, filters.path, filters);
}

/**
 * Commit set metrics: aggregates plus the rate formulas
 * eta = modifications / |H| and rho = churn / |H|.
 *
 * |H| is the number of commits in the commit set (author / time-range /
 * manual selection). The path filter selects the object under analysis and
 * intentionally does not shrink H.
 */
function getCommitSetMetrics(db, filters = {}) {
  const { where, params } = buildFilterClause(filters);
  const agg = db.prepare(`
    SELECT
      COALESCE(SUM(fc.lines_added), 0) AS added,
      COALESCE(SUM(fc.lines_removed), 0) AS removed,
      COALESCE(SUM(fc.lines_added - fc.lines_removed), 0) AS growth,
      COALESCE(SUM(fc.lines_added + fc.lines_removed), 0) AS churn,
      COUNT(DISTINCT fc.commit_hash) AS modifications
    FROM file_changes fc
    JOIN commits c ON c.hash = fc.commit_hash
    ${where}
  `).get(...params);

  // |H|: every commit in the set, whether or not it touched the path.
  const { where: commitWhere, params: commitParams } = buildFilterClause(filters, {
    includePath: false,
    commitColumn: 'c.hash'
  });
  const totalCommits = db
    .prepare(`SELECT COUNT(*) AS n FROM commits c ${commitWhere}`)
    .get(...commitParams).n;

  return {
    added: agg.added,
    removed: agg.removed,
    growth: agg.growth,
    churn: agg.churn,
    modifications: agg.modifications,
    total_commits: totalCommits,
    mod_frequency: totalCommits > 0 ? round4(agg.modifications / totalCommits) : 0,
    churn_rate: totalCommits > 0 ? round4(agg.churn / totalCommits) : 0
  };
}

/**
 * Churn timeseries: monthly buckets of added / removed / growth / churn
 * totals (type=churn-timeseries — feeds the "Churn over time" chart).
 */
function getChurnTimeseries(db, filters = {}) {
  const { where, params } = buildFilterClause(filters);
  const sql = `
    SELECT
      strftime('%Y-%m', c.timestamp, 'unixepoch') AS period,
      COALESCE(SUM(fc.lines_added), 0) AS added,
      COALESCE(SUM(fc.lines_removed), 0) AS removed,
      COALESCE(SUM(fc.lines_added - fc.lines_removed), 0) AS growth,
      COALESCE(SUM(fc.lines_added + fc.lines_removed), 0) AS churn
    FROM file_changes fc
    JOIN commits c ON c.hash = fc.commit_hash
    ${where}
    GROUP BY period
    ORDER BY period
  `;
  return db.prepare(sql).all(...params);
}

/**
 * Commit activity timeseries: commit count per month (type=commit-activity —
 * feeds the "Commit activity" chart). The `path` filter selects commits
 * that touched the path (via EXISTS), mirroring getCommitList.
 */
function getCommitActivity(db, filters = {}) {
  const { where, params } = buildFilterClause(filters, {
    includePath: false,
    commitColumn: 'c.hash'
  });

  const conditions = [];
  const allParams = [...params];
  if (where) conditions.push(where.slice('WHERE '.length));

  const path = normalizeRelativePath(filters.path);
  if (path) {
    conditions.push(
      "EXISTS (SELECT 1 FROM file_changes fp WHERE fp.commit_hash = c.hash AND (fp.file_path = ? OR fp.file_path LIKE ? ESCAPE '\\'))"
    );
    allParams.push(path, `${escapeLike(path)}/%`);
  }

  const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  return db.prepare(`
    SELECT
      strftime('%Y-%m', c.timestamp, 'unixepoch') AS period,
      COUNT(DISTINCT c.hash) AS commits
    FROM commits c
    ${whereSql}
    GROUP BY period
    ORDER BY period
  `).all(...allParams);
}

/**
 * Author metrics: per-author added/removed/growth/churn/modifications and
 * ownership (share of the total churn in scope).
 */
function getAuthorMetrics(db, filters = {}) {
  const { where, params } = buildFilterClause(filters);
  const rows = db.prepare(`
    SELECT
      c.author_name,
      c.author_email,
      COALESCE(SUM(fc.lines_added), 0) AS added,
      COALESCE(SUM(fc.lines_removed), 0) AS removed,
      COALESCE(SUM(fc.lines_added - fc.lines_removed), 0) AS growth,
      COALESCE(SUM(fc.lines_added + fc.lines_removed), 0) AS churn,
      COUNT(DISTINCT fc.commit_hash) AS modifications,
      COUNT(DISTINCT fc.file_path) AS file_count,
      MAX(c.timestamp) AS last_modified
    FROM file_changes fc
    JOIN commits c ON c.hash = fc.commit_hash
    ${where}
    GROUP BY c.author_email, c.author_name
    ORDER BY churn DESC, c.author_name ASC
  `).all(...params);

  const totalChurn = rows.reduce((sum, row) => sum + row.churn, 0);
  return rows.map((row) => ({
    ...row,
    // omega = lambda_{H,o,a} / lambda_{H,o}
    ownership: totalChurn > 0 ? round4(row.churn / totalChurn) : 0
  }));
}

/**
 * Paginated commit list.
 *
 * The `path` filter selects commits that touched the path (via EXISTS) while
 * the line statistics stay whole-commit, so commit rows remain comparable
 * regardless of the path filter.
 */
function getCommitList(db, filters = {}, page = 1, limit = 50) {
  const p = Math.max(parseInt(page, 10) || 1, 1);
  const l = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500);
  const offset = (p - 1) * l;

  const { where, params } = buildFilterClause(filters, {
    includePath: false,
    commitColumn: 'c.hash'
  });

  const conditions = [];
  const allParams = [...params];

  if (where) conditions.push(where.slice('WHERE '.length));

  const path = normalizeRelativePath(filters.path);
  if (path) {
    conditions.push(
      "EXISTS (SELECT 1 FROM file_changes fp WHERE fp.commit_hash = c.hash AND (fp.file_path = ? OR fp.file_path LIKE ? ESCAPE '\\'))"
    );
    allParams.push(path, `${escapeLike(path)}/%`);
  }

  const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = db
    .prepare(`SELECT COUNT(*) AS n FROM commits c ${whereSql}`)
    .get(...allParams).n;

  const commits = db.prepare(`
    SELECT
      c.hash,
      c.author_name,
      c.author_email,
      c.timestamp,
      c.parent_count,
      c.message,
      COUNT(DISTINCT fc.file_path) AS file_count,
      COALESCE(SUM(fc.lines_added), 0) AS added,
      COALESCE(SUM(fc.lines_removed), 0) AS removed,
      COALESCE(SUM(fc.lines_added - fc.lines_removed), 0) AS growth,
      COALESCE(SUM(fc.lines_added + fc.lines_removed), 0) AS churn
    FROM commits c
    LEFT JOIN file_changes fc ON fc.commit_hash = c.hash
    ${whereSql}
    GROUP BY c.hash
    ORDER BY c.timestamp DESC, c.hash DESC
    LIMIT ? OFFSET ?
  `).all(...allParams, l, offset);

  return {
    total,
    page: p,
    limit: l,
    pages: Math.max(Math.ceil(total / l), 1),
    commits
  };
}

/**
 * Single commit with its file changes (including rename origins).
 */
function getCommitDetail(db, hash) {
  if (!hash) return null;
  const commit = db.prepare(`
    SELECT hash, author_name, author_email, timestamp, parent_count, message
    FROM commits WHERE hash = ?
  `).get(String(hash));
  if (!commit) return null;

  const files = db.prepare(`
    SELECT file_path, lines_added, lines_removed, rename_from
    FROM file_changes
    WHERE commit_hash = ?
    ORDER BY file_path ASC
  `).all(commit.hash);

  return { ...commit, files };
}

/**
 * Distinct authors with commit counts, per-author line totals (added /
 * removed / churn) and their activity window. The LEFT JOIN keeps authors
 * whose commits touched no files (empty commits) with zeroed metrics.
 */
function getAuthors(db) {
  return db.prepare(`
    SELECT
      c.author_name,
      c.author_email,
      COUNT(DISTINCT c.hash) AS commits,
      COUNT(DISTINCT CASE WHEN c.parent_count > 1 THEN c.hash END) AS merge_commits,
      COALESCE(SUM(fc.lines_added), 0) AS added,
      COALESCE(SUM(fc.lines_removed), 0) AS removed,
      COALESCE(SUM(fc.lines_added + fc.lines_removed), 0) AS churn,
      MIN(c.timestamp) AS first_commit,
      MAX(c.timestamp) AS last_commit
    FROM commits c
    LEFT JOIN file_changes fc ON fc.commit_hash = c.hash
    GROUP BY c.author_email, c.author_name
    ORDER BY commits DESC, c.author_name ASC
  `).all();
}

/**
 * Number of distinct author identities (name + email pairs — the same
 * grouping getAuthors uses). Stored in the repo registry on ingestion so
 * listings do not need to touch the per-repo databases.
 */
function getAuthorCount(db) {
  return db.prepare(
    'SELECT COUNT(*) AS n FROM (SELECT DISTINCT author_name, author_email FROM commits)'
  ).get().n;
}

/**
 * Immediate children (files and subdirectories) of a directory with their
 * aggregated metrics — used for drill-down navigation.
 */
function getDirectoryTree(db, dirPath, filters = {}) {
  const prefix = normalizeRelativePath(dirPath);
  const scoped = { ...filters, path: prefix };
  const { where, params } = buildFilterClause(scoped);

  // Start index for substr() slicing the current directory off the path.
  const startIndex = prefix ? prefix.length + 2 : 1;

  const rows = db.prepare(`
    WITH scoped AS (
      SELECT
        fc.file_path,
        fc.lines_added,
        fc.lines_removed,
        fc.commit_hash,
        c.timestamp,
        substr(fc.file_path, ?) AS rel_path
      FROM file_changes fc
      JOIN commits c ON c.hash = fc.commit_hash
      ${where}
    )
    SELECT
      CASE
        WHEN instr(rel_path, '/') > 0 THEN substr(rel_path, 1, instr(rel_path, '/') - 1)
        ELSE rel_path
      END AS name,
      CASE WHEN instr(rel_path, '/') > 0 THEN 'directory' ELSE 'file' END AS type,
      COALESCE(SUM(lines_added), 0) AS added,
      COALESCE(SUM(lines_removed), 0) AS removed,
      COALESCE(SUM(lines_added - lines_removed), 0) AS growth,
      COALESCE(SUM(lines_added + lines_removed), 0) AS churn,
      COUNT(DISTINCT commit_hash) AS modifications,
      COUNT(DISTINCT file_path) AS file_count,
      MAX(timestamp) AS last_modified
    FROM scoped
    WHERE rel_path != ''
    GROUP BY name
  `).all(startIndex, ...params);

  const children = rows.map((row) => ({
    ...row,
    // A directory row only exists when at least one file lies beneath it
    // in the current filter scope, so directories are always expandable.
    hasChildren: row.type === 'directory',
    path: prefix ? `${prefix}/${row.name}` : row.name
  }));

  // Directories first, then by churn descending, then alphabetically.
  children.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    if (b.churn !== a.churn) return b.churn - a.churn;
    return a.name.localeCompare(b.name);
  });

  return children;
}

module.exports = {
  buildFilterClause,
  getFileMetrics,
  getDirectoryMetrics,
  getRepoMetrics,
  getCommitSetMetrics,
  getChurnTimeseries,
  getCommitActivity,
  getAuthorMetrics,
  getCommitList,
  getCommitDetail,
  getAuthors,
  getAuthorCount,
  getDirectoryTree
};
