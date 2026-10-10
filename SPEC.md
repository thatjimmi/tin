# Tin file format (v1)

A `.tin` file is a plain SQLite database. Any SQLite tool can open it.

## Identification

```sql
PRAGMA application_id = 0x54494E21;  -- "TIN!"
PRAGMA user_version   = 1;           -- schema version, drives migrations
```

## Schema

```sql
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE ui (
  version    INTEGER PRIMARY KEY,
  html       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE docs (
  _id         TEXT PRIMARY KEY,   -- UUIDv7
  collection  TEXT NOT NULL,
  data        TEXT NOT NULL,      -- JSON
  _created_at TEXT NOT NULL,
  _updated_at TEXT NOT NULL,
  _deleted    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX docs_collection ON docs(collection);

CREATE TABLE kv (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE assets (
  id         TEXT PRIMARY KEY,
  belongs_to TEXT NOT NULL,
  name       TEXT,
  mime       TEXT,
  bytes      BLOB NOT NULL
);

CREATE TABLE permissions (
  name     TEXT PRIMARY KEY,
  granted  INTEGER,
  reason   TEXT
);
```

## Semantics

- `ui` is append-only: every save inserts a new `version` row. The player always
  runs `MAX(version)`. History doubles as undo.
- `meta` holds at least `title` and `api_version`.
- `docs` is a flat JSON document store, grouped by `collection`. Deletes are
  soft (`_deleted = 1`) so sync/merge can see tombstones.
- `assets` are binary blobs (images, PDFs, etc.) owned by a doc (`belongs_to`)
  or `"_app"` for app-level files.
- `permissions` records user grants for capabilities the sandbox can't decide
  on its own (network access, etc.). Not enforced yet in v1.

## Versioning

`user_version` identifies the schema version. A reader must refuse to open a
file with a higher `user_version` than it knows, and must migrate forward
step-by-step for lower versions.
