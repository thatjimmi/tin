// Schema for .tin files. Kept as one SQL string so SPEC.md and this file
// are the only two places that need to agree. See SPEC.md for semantics.

export const APPLICATION_ID = 0x54494e21; // "TIN!"
export const SCHEMA_VERSION = 1;

export const SCHEMA_SQL = `
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
  _id         TEXT PRIMARY KEY,
  collection  TEXT NOT NULL,
  data        TEXT NOT NULL,
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
  name    TEXT PRIMARY KEY,
  granted INTEGER,
  reason  TEXT
);
`;
