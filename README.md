# RAT — Repo Analysis Tool

## Overview

A web-app dashboard for analyzing git repositories. Computes metrics (lines added/removed, growth, churn, modification frequency, author ownership) across files, directories, commits, and authors. Built for COMS3011A at Wits University.

## Features

- Repository ingestion via zip upload or remote URL clone
- Multi-repository support
- Author merging (via `.mailmap` or manual)
- Filtering by repository, author, file/directory, time range, or manual commit selection
- Metric categories: File, Directory, Repository, Commit Set, Author

## Tech Stack

- **Backend**: Node.js 18, Express 4, SQLite (better-sqlite3)
- **Frontend**: React 18, Vite 5, Ant Design 5, Recharts 2
- **Git Analysis**: CLI git via `child_process.spawn`

## Project Structure

```
sd-test/
├── backend/
│   ├── package.json
│   ├── data/                        # SQLite databases (runtime, gitignored)
│   ├── repos/                       # Cloned/extracted repositories (runtime, gitignored)
│   └── src/
│       ├── index.js                 # Entry point — starts Express on port 3001
│       ├── app.js                   # Express app: middleware and route mounting
│       ├── config.js                # Ports, paths, constants
│       ├── db/
│       │   ├── connection.js        # better-sqlite3 connection and migrations
│       │   └── schema.sql           # Table definitions (repositories, commits, files, authors)
│       ├── routes/
│       │   ├── repositories.js      # Zip upload, URL clone, list, delete
│       │   ├── commits.js           # Commit listing and filtering
│       │   ├── authors.js           # Author listing, mailmap/manual merge
│       │   └── metrics.js           # File/Directory/Repository/Commit-set/Author metrics
│       ├── services/
│       │   ├── ingestionService.js  # Zip extraction and git clone orchestration
│       │   ├── gitService.js        # git CLI wrapper (child_process.spawn)
│       │   ├── parseService.js      # Parses git history into the database
│       │   ├── authorService.js     # .mailmap parsing and manual author merging
│       │   └── metricsService.js    # Metric computation and aggregation
│       └── utils/
│           └── validators.js        # Input validation helpers
└── frontend/
    ├── package.json
    ├── vite.config.js               # Dev server (port 5173) + API proxy to :3001
    ├── index.html
    └── src/
        ├── main.jsx                 # React entry — Ant Design theme provider
        ├── App.jsx                  # Layout shell and routing
        ├── api/
        │   └── client.js            # Fetch wrapper for the backend API
        ├── context/
        │   └── FilterContext.jsx    # Global filter state (repo/author/path/time/commit-set)
        ├── components/
        │   ├── FilterBar.jsx        # Repository, author, file/dir and time-range filters
        │   ├── CommitSelector.jsx   # Manual commit-set selection
        │   ├── MetricCard.jsx       # Metric summary cards
        │   ├── MetricsTable.jsx     # Sortable metrics table
        │   ├── RepoUploadModal.jsx  # Zip upload / URL clone dialog
        │   ├── AuthorMergeModal.jsx # Author merge dialog (mailmap or manual)
        │   └── charts/
        │       ├── ChurnChart.jsx     # Churn / added / removed visualisation (Recharts)
        │       └── OwnershipChart.jsx # Author ownership visualisation (Recharts)
        └── pages/
            ├── RepositoriesPage.jsx # Repository management
            ├── DashboardPage.jsx    # Filterable metrics dashboard
            └── AuthorsPage.jsx      # Author management and merging
```

## Metrics

Notation: for a commit \(h\), \(h[f]\) are the files in the commit, \(h[p]\) is the previous commit, \(l^+_{h,f}\) and \(l^-_{h,f}\) are the lines added/removed on file \(f\), and \(H\) is a commit set (subset of the non-merge commits reachable from HEAD).

### File Metrics

Per-commit, per-file values:

- **Added Lines** — \(l^+_{h,f}\): lines added to file \(f\) from commit \(h\) to \(h[p]\)
- **Removed Lines** — \(l^-_{h,f}\): lines removed from file \(f\) from commit \(h\) to \(h[p]\)
- **Growth** — \(\delta_{h,f} = l^+_{h,f} - l^-_{h,f}\): net change in line count
- **Churn** — \(\lambda_{h,f} = l^+_{h,f} + l^-_{h,f}\): total changed lines

Renames are detected with a 50% similarity threshold, so a rename alone does not alter metrics; changes are attributed to the new path. Deletions are recorded as removals on the old path. Binary files are not measured.

### Directory Metrics

Recursive aggregation of file and immediate-subdirectory metrics:

- **Added Lines / Removed Lines** — \(\sum\) over immediate child files and subdirectories
- **Growth** — \(\delta_{h,d} = \sum_{d' \in d} \delta_{h,d'} + \sum_{f \in d} \delta_{h,f}\)
- **Churn** — \(\lambda_{h,d} = \sum_{d' \in d} \lambda_{h,d'} + \sum_{f \in d} \lambda_{h,f}\)

### Repository Metrics

Directory metrics evaluated on the root of the commit tree.

### Commit Set Metrics

Aggregates over a commit set \(H\) (sums of the per-commit values) for any object \(o \in H[F] \cup H[D]\):

- **Added / Removed Lines, Growth, Churn** — e.g. \(l^+_{H,o} = \sum_{h \in H} l^+_{h,o}\)
- **Modifications** — \(n_{H,o}\): number of commits that changed \(o\) at all
- **Modification Frequency** — \(\eta_{H,o} = n_{H,o} / |H|\)
- **Churn Rate** — \(\rho_{H,o} = \lambda_{H,o} / |H|\)

### Author Metrics

Computed per author \(a\) on any file or directory \(o \in H[F] \cup H[D]\):

- **Author Modifications** — \(n_{H,o,a} = \sum_{h \in H} \mathbb{I}(a,h) \cdot \mathbb{I}_n(h,o)\)
- **Author Churn** — \(\lambda_{H,o,a} = \sum_{h \in H} \lambda_{h,o} \cdot \mathbb{I}(a,h)\)
- **Author Ownership** — \(\omega_{H,o,a} = \lambda_{H,o,a} / \lambda_{H,o}\): fraction of total churn produced by author \(a\)

## Getting Started

### Prerequisites

- Node.js 18+
- Git 2.40+

### Installation

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### Running

```bash
# Start backend (port 3001)
cd backend
npm start

# Start frontend (port 5173)
cd frontend
npm run dev
```

Then open http://localhost:5173 in a browser. The Vite dev server proxies `/api` requests to the backend on port 3001.

## API Endpoints

### Repositories

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| `POST` | `/api/repositories/upload` | Upload a zip archive of a repository (must include `.git`) |
| `POST` | `/api/repositories/clone` | Deep-clone a remote repository URL |
| `GET` | `/api/repositories` | List all ingested repositories |
| `GET` | `/api/repositories/:id` | Repository details (status, head commit, counts) |
| `DELETE` | `/api/repositories/:id` | Delete a repository and all derived data |

### Authors

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| `GET` | `/api/repositories/:id/authors` | List authors after merging |
| `POST` | `/api/repositories/:id/authors/merge` | Apply a `.mailmap` or merge authors manually |

### Commits

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| `GET` | `/api/repositories/:id/commits` | List commits (filters: `from`, `to`, `path`, `author`) |

### Metrics

Common query parameters across metric endpoints: `path`, `author`, `from`, `to`, and `commits` (manual commit selection).

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| `GET` | `/api/repositories/:id/metrics/file` | File metrics for a path and commit set |
| `GET` | `/api/repositories/:id/metrics/directory` | Directory metrics (recursive) |
| `GET` | `/api/repositories/:id/metrics/repository` | Repository metrics (root directory) |
| `GET` | `/api/repositories/:id/metrics/commit-set` | Commit-set aggregates (time range or manual selection) |
| `GET` | `/api/repositories/:id/metrics/author` | Author modifications, churn, and ownership |

