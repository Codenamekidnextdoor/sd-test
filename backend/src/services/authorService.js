'use strict';

/**
 * Author identity handling: .mailmap parsing, alias resolution and manual
 * author merging.
 *
 * The `author_aliases` table is the source of truth for alias -> canonical
 * mappings; merging also rewrites matching rows in `commits` so that all
 * metric queries (which group by author_name/author_email) see the merged
 * identity without extra joins.
 */

const fs = require('fs');
const path = require('path');

/**
 * Parse a single non-comment line of a .mailmap file.
 * Supported formats (gitmailmap):
 *   Proper Name <proper@email>
 *   <proper@email> <commit@email>
 *   Proper Name <proper@email> <commit@email>
 *   Proper Name <proper@email> Commit Name <commit@email>
 * Returns { aliasName, aliasEmail, canonicalName, canonicalEmail } or null.
 */
function parseMailmapLine(line) {
  const emailRe = /<([^<>]+)>/g;
  const emails = [];
  const names = [];
  let match;
  let lastIndex = 0;

  while ((match = emailRe.exec(line)) !== null) {
    names.push(line.slice(lastIndex, match.index).trim());
    emails.push(match[1].trim());
    lastIndex = match.index + match[0].length;
  }

  if (emails.length === 0) return null;

  if (emails.length === 1) {
    // "Proper Name <email>": name mapping for that exact email.
    const canonicalName = names[0] || '';
    if (!canonicalName) return null;
    return {
      aliasName: '',
      aliasEmail: emails[0],
      canonicalName,
      canonicalEmail: emails[0]
    };
  }

  // Two emails: canonical first, alias second (any names optional).
  const canonicalName = names[0] || '';
  const aliasName = names[1] || '';
  return {
    aliasName,
    aliasEmail: emails[1],
    canonicalName: canonicalName || aliasName,
    canonicalEmail: emails[0]
  };
}

/**
 * Read and parse <repoPath>/.mailmap. Returns [] when the file is absent.
 */
function parseMailmap(repoPath) {
  const mailmapPath = path.join(repoPath, '.mailmap');
  if (!fs.existsSync(mailmapPath)) return [];

  const entries = [];
  const lines = fs.readFileSync(mailmapPath, 'utf8').split(/\r?\n/);
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    const parsed = parseMailmapLine(line);
    if (parsed) entries.push(parsed);
  }
  return entries;
}

/**
 * Merge one or more aliases into a canonical author:
 *  - records every alias mapping in `author_aliases`
 *  - rewrites matching commit rows to the canonical identity
 *
 * Returns { aliasesAdded, commitsUpdated }.
 */
function mergeAuthors(db, canonicalName, canonicalEmail, aliases = []) {
  const cn = String(canonicalName || '').trim();
  const ce = String(canonicalEmail || '').trim();
  if (!cn && !ce) {
    const err = new Error('canonicalName or canonicalEmail is required');
    err.status = 400;
    throw err;
  }

  const findAlias = db.prepare(`
    SELECT id FROM author_aliases
    WHERE alias_name = ? AND alias_email = ? AND canonical_name = ? AND canonical_email = ?
    LIMIT 1
  `);
  const insertAlias = db.prepare(`
    INSERT INTO author_aliases (alias_name, alias_email, canonical_name, canonical_email)
    VALUES (?, ?, ?, ?)
  `);

  // Commit rewrites. Matching prefers the alias email; when it is unknown we
  // fall back to the alias name. Unknown canonical fields are left aside:
  // the alias email is kept when there is no canonical email, and the
  // existing display name is kept when there is no canonical name.
  const updateEmailAndNameByEmail = db.prepare('UPDATE commits SET author_name = ?, author_email = ? WHERE author_email = ?');
  const updateEmailOnlyByEmail = db.prepare('UPDATE commits SET author_email = ? WHERE author_email = ?');
  const updateEmailAndNameByName = db.prepare('UPDATE commits SET author_name = ?, author_email = ? WHERE author_name = ?');
  const updateNameByName = db.prepare('UPDATE commits SET author_name = ? WHERE author_name = ?');
  const updateEmailOnlyByName = db.prepare('UPDATE commits SET author_email = ? WHERE author_name = ?');

  const run = db.transaction(() => {
    let aliasesAdded = 0;
    let commitsUpdated = 0;

    for (const alias of aliases) {
      const aName = String(alias && alias.name ? alias.name : '').trim();
      const aEmail = String(alias && alias.email ? alias.email : '').trim();
      if (!aName && !aEmail) continue;

      if (!findAlias.get(aName, aEmail, cn, ce)) {
        insertAlias.run(aName, aEmail, cn, ce);
        aliasesAdded += 1;
      }

      if (aEmail) {
        if (cn) {
          // Name known: rename + remap (keep the alias email when no
          // canonical email is known).
          commitsUpdated += updateEmailAndNameByEmail.run(cn, ce || aEmail, aEmail).changes;
        } else if (ce) {
          commitsUpdated += updateEmailOnlyByEmail.run(ce, aEmail).changes;
        }
      } else if (aName) {
        if (cn && ce) {
          commitsUpdated += updateEmailAndNameByName.run(cn, ce, aName).changes;
        } else if (cn) {
          commitsUpdated += updateNameByName.run(cn, aName).changes;
        } else if (ce) {
          commitsUpdated += updateEmailOnlyByName.run(ce, aName).changes;
        }
      }
    }

    return { aliasesAdded, commitsUpdated };
  });

  return run();
}

/**
 * Resolve an author identity through the alias table.
 * Returns { name, email } — canonical when a mapping exists, the input
 * otherwise.
 */
function getResolvedAuthorName(db, name, email) {
  const n = String(name || '');
  const e = String(email || '');
  const row = db.prepare(`
    SELECT canonical_name, canonical_email
    FROM author_aliases
    WHERE (alias_email != '' AND alias_email = ?)
       OR (alias_name != '' AND alias_name = ?)
    LIMIT 1
  `).get(e, n);

  if (!row) return { name: n, email: e };
  return {
    name: row.canonical_name || n,
    email: row.canonical_email || e
  };
}

/**
 * Apply a repository's .mailmap to the database.
 * Returns { entries, aliasesAdded, commitsUpdated }.
 */
function importMailmap(db, repoPath) {
  const entries = parseMailmap(repoPath);
  let aliasesAdded = 0;
  let commitsUpdated = 0;

  for (const entry of entries) {
    const result = mergeAuthors(db, entry.canonicalName, entry.canonicalEmail, [
      { name: entry.aliasName, email: entry.aliasEmail }
    ]);
    aliasesAdded += result.aliasesAdded;
    commitsUpdated += result.commitsUpdated;
  }

  return { entries: entries.length, aliasesAdded, commitsUpdated };
}

module.exports = {
  parseMailmapLine,
  parseMailmap,
  mergeAuthors,
  getResolvedAuthorName,
  importMailmap
};
