'use strict';

/**
 * Global Express error handling.
 */

/**
 * Wrap an async route handler so rejected promises reach the error
 * middleware instead of crashing the process.
 */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/** 404 fallback for unmatched routes. */
function notFoundHandler(req, res) {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
}

/** Terminal error middleware — always emits JSON. */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (res.headersSent) return;

  let status = err.status || err.statusCode || 500;
  let message = err.message || 'Internal server error';

  // Multer upload errors.
  if (err.code === 'LIMIT_FILE_SIZE') {
    status = 413;
    message = 'Uploaded file is too large (limit: 1 GiB)';
  } else if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
    status = 400;
    message = 'Unexpected upload field — send exactly one .zip file in the `file` field';
  } else if (err instanceof SyntaxError && 'body' in err) {
    // body-parser JSON parse failure.
    status = 400;
    message = 'Invalid JSON body';
  }

  if (!Number.isInteger(status) || status < 400 || status > 599) status = 500;

  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}:`, err.stack || err);
  }

  res.status(status).json({ error: message });
}

module.exports = { asyncHandler, notFoundHandler, errorHandler };
