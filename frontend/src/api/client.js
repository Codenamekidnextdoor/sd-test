import axios from 'axios';

/**
 * Axios instance for the RAT backend (proxied by Vite at /api -> localhost:3001).
 */
const client = axios.create({
  baseURL: '/api',
  timeout: 15 * 60 * 1000, // deep clones / large zip ingestion can take a while
  headers: { 'Content-Type': 'application/json' }
});

/** Unwrap common payload envelopes: { data: ... } | { repos: [...] } | raw. */
function unwrap(res) {
  const body = res?.data;
  if (body === undefined || body === null) return body;
  if (typeof body === 'object' && !Array.isArray(body) && 'data' in body) return body.data;
  return body;
}

/** Human-readable message for any axios error. */
export function getErrorMessage(error) {
  if (!error) return 'Unknown error';
  if (error.response) {
    const body = error.response.data;
    if (body && typeof body === 'object') {
      if (typeof body.error === 'string') return body.error;
      if (typeof body.message === 'string') return body.message;
    }
    if (typeof body === 'string' && body.trim()) return body;
    return `Request failed (HTTP ${error.response.status})`;
  }
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return 'Request timed out — the repository may still be processing.';
  return error.message || 'Network error — is the backend running on port 3001?';
}

/**
 * Convert a date-ish filter value to unix seconds (the unit the backend
 * expects). Accepts ISO strings, Date objects, and epoch seconds/millis;
 * returns null for empty/invalid values.
 */
function toUnixSeconds(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return Math.floor(value > 1e12 ? value / 1000 : value);
  }
  const ms = Date.parse(String(value));
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

/**
 * Serialize FilterContext state into flat query params.
 * `from`/`to` are stored as ISO date strings in the context and converted
 * here to unix seconds, which is what the backend's parseFilters expects.
 * Multi-value params (author[], commits[]) are sent as JSON array strings —
 * the backend's parseListParam parses them back into arrays. A plain comma
 * join would be ambiguous: author names such as "Schalk, Ken" contain
 * commas and would be silently split into two wrong filters.
 */
export function buildFilterParams(filters = {}) {
  const { author, path, from, to, commits } = filters || {};
  const params = {};
  if (Array.isArray(author)) {
    const authors = author.map((value) => String(value).trim()).filter(Boolean);
    if (authors.length > 0) params.author = JSON.stringify(authors);
  } else if (typeof author === 'string' && author.trim()) {
    params.author = author.trim();
  }
  if (path) params.path = path;
  const fromUnix = toUnixSeconds(from);
  const toUnix = toUnixSeconds(to);
  if (fromUnix !== null) params.from = fromUnix;
  if (toUnix !== null) params.to = toUnix;
  if (Array.isArray(commits) && commits.length > 0) {
    params.commits = JSON.stringify(commits.map(String).filter(Boolean));
  }
  return params;
}

/** GET /api/repos -> [{ id, name, url?, addedAt?, status?, commitCount?, authorCount? }] */
export async function getRepos() {
  const res = await client.get('/repos');
  const data = unwrap(res);
  return Array.isArray(data) ? data : data?.repos ?? [];
}

/** POST /api/repos/clone { url, name? } -> repo */
export async function cloneRepo(url, name) {
  const payload = { url };
  if (name) payload.name = name;
  const res = await client.post('/repos/clone', payload);
  return unwrap(res);
}

/** POST /api/repos/upload (multipart zip) with progress callback -> repo */
export async function uploadRepo(file, onProgress) {
  const form = new FormData();
  form.append('file', file, file.name);
  const res = await client.post('/repos/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (event) => {
      if (onProgress && event.total) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    }
  });
  return unwrap(res);
}

/** DELETE /api/repos/:id */
export async function deleteRepo(id) {
  const res = await client.delete(`/repos/${encodeURIComponent(id)}`);
  return unwrap(res);
}

/**
 * GET /api/repos/:id/metrics?type=repo|file|directory|authors|churn-timeseries|commit-activity
 * plus filters: author, path, from, to, commits.
 * `extraParams` carries type-specific params such as page/limit for the
 * server-side paginated file metrics.
 */
export async function getMetrics(repoId, type, filters = {}, extraParams = {}) {
  const res = await client.get(`/repos/${encodeURIComponent(repoId)}/metrics`, {
    params: { type, ...buildFilterParams(filters), ...extraParams }
  });
  const body = res?.data;
  // Paginated envelope ({ data, total, page, limit }): keep it intact so the
  // caller keeps the pagination metadata — `unwrap` would strip it to body.data.
  if (
    body &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    Array.isArray(body.data) &&
    Number.isFinite(Number(body.total))
  ) {
    return body;
  }
  return unwrap(res);
}

/** GET /api/repos/:id/commits?page=&limit= -> { commits, total, page } */
export async function getCommits(repoId, filters = {}, page = 1, limit = 100) {
  const res = await client.get(`/repos/${encodeURIComponent(repoId)}/commits`, {
    params: { page, limit, ...buildFilterParams(filters) }
  });
  const data = unwrap(res);
  if (Array.isArray(data)) return { commits: data, total: data.length, page };
  return {
    commits: data?.commits ?? [],
    total: data?.total ?? data?.commits?.length ?? 0,
    page: data?.page ?? page
  };
}

/** GET /api/repos/:id/authors -> [{ name, email, commits, added, removed, growth, churn }] */
export async function getAuthors(repoId) {
  const res = await client.get(`/repos/${encodeURIComponent(repoId)}/authors`);
  const data = unwrap(res);
  return Array.isArray(data) ? data : data?.authors ?? [];
}

/** POST /api/repos/:id/authors/merge { canonicalName, canonicalEmail, aliases } */
export async function mergeAuthors(repoId, canonicalName, canonicalEmail, aliases) {
  const res = await client.post(`/repos/${encodeURIComponent(repoId)}/authors/merge`, {
    canonicalName,
    canonicalEmail,
    aliases
  });
  return unwrap(res);
}

/**
 * GET /api/repos/:id/tree?path=&filters
 * Returns a node ({ name, path, children, ...metrics }) or a children array.
 * NOTE: the node path must win over any path set in filters.
 */
export async function getDirectoryTree(repoId, path = '', filters = {}) {
  const res = await client.get(`/repos/${encodeURIComponent(repoId)}/tree`, {
    params: { ...buildFilterParams(filters), path }
  });
  return unwrap(res);
}

export default client;
