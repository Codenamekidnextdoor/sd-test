CREATE TABLE IF NOT EXISTS commits (
  hash TEXT PRIMARY KEY,
  author_name TEXT NOT NULL,
  author_email TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  parent_count INTEGER NOT NULL,
  message TEXT
);

CREATE TABLE IF NOT EXISTS file_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  commit_hash TEXT NOT NULL REFERENCES commits(hash),
  file_path TEXT NOT NULL,
  lines_added INTEGER NOT NULL,
  lines_removed INTEGER NOT NULL,
  rename_from TEXT
);

CREATE TABLE IF NOT EXISTS author_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alias_name TEXT NOT NULL,
  alias_email TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  canonical_email TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fc_path ON file_changes(file_path);
CREATE INDEX IF NOT EXISTS idx_fc_commit ON file_changes(commit_hash);
CREATE INDEX IF NOT EXISTS idx_commits_ts ON commits(timestamp);
CREATE INDEX IF NOT EXISTS idx_commits_author ON commits(author_email);

-- Composite indexes for the common query patterns: commit+path joins for
-- file metrics, path-scoped churn sums, and author/time-range filtering.
CREATE INDEX IF NOT EXISTS idx_fc_commit_path ON file_changes(commit_hash, file_path);
CREATE INDEX IF NOT EXISTS idx_fc_path_added_removed ON file_changes(file_path, lines_added, lines_removed);
CREATE INDEX IF NOT EXISTS idx_commits_ts_author ON commits(timestamp, author_email);
