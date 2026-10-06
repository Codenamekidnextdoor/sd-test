'use strict';

/**
 * Streaming parser for the output of:
 *
 *   git log --no-merges --numstat --root -M50%
 *           --format=__COMMIT__%H__%aN__%aE__%at__%P__%s
 *
 * Output layout per commit:
 *
 *   __COMMIT__<hash>__<author name>__<author email>__<unix ts>__<parents>__<subject>
 *   <added>\t<removed>\t<path>        (one line per changed file)
 *   ...
 *
 * Special cases handled:
 *   - binary files        -> numstat shows "-\t-\t<path>"; skipped entirely
 *   - renames             -> "old => new" and brace notation
 *                            "src/{old => new}.js" with optional empty side
 *                            "src/{ => lib}/file.js"
 *   - quoted paths        -> `"h\303\251llo.txt"` (git core.quotepath) with
 *                            octal byte escapes decoded as UTF-8
 *   - names/subjects      -> the header is anchored on the timestamp (digits
 *     containing "__"        directly followed by the parent list) so a name
 *                            or subject containing "__" still round-trips
 */

const readline = require('readline');
const { collapseSlashes } = require('../utils/pathUtils');

const COMMIT_PREFIX = '__COMMIT__';
const NUMSTAT_RE = /^(\d+|-)\t(\d+|-)\t(.+)$/;

// Parent list emitted by %P: space-separated FULL-length lowercase hashes
// (40 hex chars for SHA-1, 64 for SHA-256) — never abbreviated — or an
// empty string for root commits. Anything else in that slot cannot be a
// genuine parent list.
const PARENTS_RE = /^[0-9a-f]{40}(?: [0-9a-f]{40})*$|^[0-9a-f]{64}(?: [0-9a-f]{64})*$/;

/**
 * Decode a git-quoted path (`"..."` with backslash escapes) into a plain
 * UTF-8 string. Strings without surrounding quotes are returned unchanged.
 */
function unquoteGitPath(raw) {
  const s = String(raw);
  if (s.length < 2 || !s.startsWith('"') || !s.endsWith('"')) return s;

  const inner = s.slice(1, -1);
  let out = '';
  let bytes = [];
  const flushBytes = () => {
    if (bytes.length) {
      out += Buffer.from(bytes).toString('utf8');
      bytes = [];
    }
  };

  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    if (ch === '\\' && i + 1 < inner.length) {
      const octal = inner.slice(i + 1, i + 4);
      if (/^[0-7]{3}$/.test(octal)) {
        bytes.push(parseInt(octal, 8));
        i += 3;
        continue;
      }
      flushBytes();
      const next = inner[i + 1];
      if (next === 't') out += '\t';
      else if (next === 'n') out += '\n';
      else if (next === 'r') out += '\r';
      else if (next === '\\') out += '\\';
      else if (next === '"') out += '"';
      else out += next;
      i += 1;
      continue;
    }
    flushBytes();
    out += ch;
  }
  flushBytes();
  return out;
}

/** True when git quoted the entire path as a single token. */
function isFullyQuoted(raw) {
  const s = String(raw);
  return (
    s.length >= 2 &&
    s.startsWith('"') &&
    s.endsWith('"') &&
    !s.slice(1, -1).includes('"')
  );
}

/**
 * Parse the path column of a numstat line when it denotes a rename.
 * Returns { from, to } or null when it is not a rename.
 */
function parseRenamePath(rawPath) {
  if (!rawPath) return null;
  const display = isFullyQuoted(rawPath) ? unquoteGitPath(rawPath) : String(rawPath);

  // Brace notation: prefix{old => new}suffix (either side may be empty).
  const braceMatch = display.match(/^(.*?)\{(.*?) => (.*?)\}(.*)$/);
  if (braceMatch) {
    const [, prefix, oldMid, newMid, suffix] = braceMatch;
    return {
      from: unquoteGitPath(collapseSlashes(prefix + oldMid + suffix)),
      to: unquoteGitPath(collapseSlashes(prefix + newMid + suffix))
    };
  }

  // Plain notation: old => new (sides may be individually quoted).
  const arrowMatch = display.match(/^(.*?) => (.*)$/);
  if (arrowMatch) {
    return {
      from: unquoteGitPath(arrowMatch[1]),
      to: unquoteGitPath(arrowMatch[2])
    };
  }

  return null;
}

/**
 * Parse a commit header line into a commit descriptor, or null when the
 * line is not a commit marker or cannot be anchored.
 *
 * Both the author name and the subject may contain "__" (the field
 * separator), so the field boundary is located by anchoring on the
 * timestamp: a digits-only part directly followed by a valid parent list.
 * Everything between the hash and the email is the (possibly "__"-laden)
 * name; everything after the parent list is the subject.
 */
function parseCommitHeader(line) {
  const s = String(line);
  if (!s.startsWith(COMMIT_PREFIX)) return null;

  const parts = s.slice(COMMIT_PREFIX.length).split('__');
  if (parts.length < 5) return null;

  const hash = parts[0];

  // Scan right-to-left: the real timestamp is the last digits-only part
  // whose successor is empty or a valid parent list. (A subject containing
  // such a pattern is possible only in contrived cases since parent tokens
  // are full-length hashes.)
  for (let i = parts.length - 2; i >= 3; i -= 1) {
    if (!/^\d+$/.test(parts[i])) continue;
    const parentsRaw = parts[i + 1].trim();
    if (parentsRaw && !PARENTS_RE.test(parentsRaw)) continue;

    const parents = parentsRaw ? parentsRaw.split(/\s+/).filter(Boolean) : [];
    return {
      hash,
      authorName: parts.slice(1, i - 1).join('__'),
      authorEmail: parts[i - 1],
      timestamp: parseInt(parts[i], 10),
      parentCount: parents.length,
      parents,
      message: parts.slice(i + 2).join('__')
    };
  }

  return null;
}

/**
 * Parse one numstat line.
 * Returns { path, added, removed, renameFrom } or null for blank lines and
 * binary files (which are not measured).
 */
function parseNumstatLine(line) {
  const s = String(line);
  if (!s || s.startsWith(COMMIT_PREFIX)) return null;

  const match = s.match(NUMSTAT_RE);
  if (!match) return null;

  const [, addedRaw, removedRaw, rawPath] = match;
  if (addedRaw === '-' || removedRaw === '-') return null; // binary file

  const added = parseInt(addedRaw, 10);
  const removed = parseInt(removedRaw, 10);

  const rename = parseRenamePath(rawPath);
  if (rename) {
    return {
      path: collapseSlashes(rename.to),
      renameFrom: collapseSlashes(rename.from),
      added,
      removed
    };
  }

  return {
    path: collapseSlashes(unquoteGitPath(rawPath)),
    renameFrom: null,
    added,
    removed
  };
}

/**
 * Async generator over the stdout stream of getGitLog().
 * Yields commit objects:
 *   { hash, authorName, authorEmail, timestamp, parentCount, parents,
 *     message, files }
 * where files are { path, added, removed, renameFrom }.
 */
async function* parseGitLog(stream) {
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let current = null;

  for await (const rawLine of rl) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;

    if (line.startsWith(COMMIT_PREFIX)) {
      // Emit the previous commit before starting the next one.
      if (current) yield current;
      const header = parseCommitHeader(line);
      current = header ? { ...header, files: [] } : null;
      continue;
    }

    if (!current || !line) continue;

    const change = parseNumstatLine(line);
    if (change) current.files.push(change);
  }

  if (current) yield current;
}

module.exports = {
  COMMIT_PREFIX,
  parseCommitHeader,
  parseNumstatLine,
  parseRenamePath,
  unquoteGitPath,
  parseGitLog
};
