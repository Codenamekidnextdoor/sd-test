'use strict';

/**
 * Thin wrappers around the git CLI (child_process.spawn).
 * All long-running commands are spawned with non-interactive settings so a
 * server process can never hang waiting for credentials.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { RENAME_THRESHOLD } = require('../config');

const GIT_ENV = {
  ...process.env,
  GIT_TERMINAL_PROMPT: '0',
  GIT_ASKPASS: 'echo'
};

/**
 * Clone `url` into `destPath`. Resolves with destPath on success, rejects
 * with the captured stderr otherwise.
 */
function cloneRepo(url, destPath) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['clone', '--', url, destPath], {
      env: GIT_ENV,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    child.on('error', (err) => {
      reject(new Error(`Failed to run git: ${err.message}`));
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(destPath);
      } else {
        const detail = (stderr || stdout).trim().split('\n').slice(-3).join(' ');
        const err = new Error(`git clone failed (exit ${code}): ${detail}`);
        err.status = 422; // bad/unreachable URL — the request itself was fine
        reject(err);
      }
    });
  });
}

/**
 * Spawn `git log --no-merges --numstat --root -M50%` with the
 * __COMMIT__ marker format (hash, author, timestamp, parents, subject)
 * and return the stdout stream.
 *
 * Only commits reachable from HEAD are traversed (no --all), matching the
 * reference tooling which analyzes the checked-out ref only. Using --all
 * would additionally pull in commits from other branches and inflate the
 * commit count (e.g. cJSON: 1053 with --all vs 955 from HEAD).
 *
 * The returned stream carries two extra properties so callers can inspect
 * the process without another spawn:
 *   stream.gitProcess - the ChildProcess
 *   stream.gitExit    - Promise<{ code, stderr }> resolving when git exits
 */
function getGitLog(repoPath) {
  const format = '--format=__COMMIT__%H__%aN__%aE__%at__%P__%s';
  const args = [
    '-C', repoPath,
    'log',
    '--no-merges',
    '--numstat',
    '--root',
    `-M${RENAME_THRESHOLD}%`,
    format
  ];

  const child = spawn('git', args, {
    env: GIT_ENV,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

  const stream = child.stdout;
  stream.gitProcess = child;
  stream.gitExit = new Promise((resolve) => {
    child.on('error', (error) => {
      resolve({ code: -1, stderr: error.message, error });
    });
    child.on('close', (code) => {
      resolve({ code, stderr });
    });
  });

  return stream;
}

/** True when the repository carries a .mailmap file. */
function hasMailmap(repoPath) {
  return fs.existsSync(path.join(repoPath, '.mailmap'));
}

/**
 * True when `dir` looks like a git repository/worktree root
 * (.git directory or a .git file pointing at a gitdir).
 */
function isGitRepo(dir) {
  try {
    return fs.existsSync(path.join(dir, '.git'));
  } catch (err) {
    return false;
  }
}

module.exports = {
  cloneRepo,
  getGitLog,
  hasMailmap,
  isGitRepo
};
