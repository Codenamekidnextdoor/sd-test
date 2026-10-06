'use strict';

/**
 * Multer configuration for zip uploads.
 * Files land in the OS temp directory with a randomized name; ingestion
 * removes them once the archive has been extracted.
 */

const multer = require('multer');
const os = require('os');
const crypto = require('crypto');

const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024; // 1 GiB

const ZIP_MIME_TYPES = new Set([
  'application/zip',
  'application/x-zip',
  'application/x-zip-compressed',
  'multipart/x-zip'
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, os.tmpdir()),
  filename: (req, file, cb) => {
    const random = crypto.randomBytes(8).toString('hex');
    cb(null, `rat-upload-${Date.now()}-${random}.zip`);
  }
});

function fileFilter(req, file, cb) {
  const name = String(file.originalname || '').toLowerCase();
  const mime = String(file.mimetype || '').toLowerCase();
  const isZipName = name.endsWith('.zip');
  const isZipMime = ZIP_MIME_TYPES.has(mime);

  if (isZipName || isZipMime) {
    cb(null, true);
    return;
  }

  const err = new Error('Only .zip archives are accepted');
  err.status = 400;
  cb(err);
}

module.exports = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 }
});
