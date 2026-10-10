import { DatabaseSync } from "node:sqlite";
import { APPLICATION_ID, SCHEMA_SQL, SCHEMA_VERSION } from "./schema.ts";

export { APPLICATION_ID, SCHEMA_VERSION };

/** Create a new .tin file at `path` with a single UI version and optional meta. */
export function createTin(
  path: string,
  html: string,
  meta: Record<string, string> = {},
): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA application_id = ${APPLICATION_ID};`);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  db.exec(SCHEMA_SQL);

  db.prepare(
    "INSERT INTO ui (version, html, created_at) VALUES (1, ?, ?)",
  ).run(html, new Date().toISOString());

  const setMeta = db.prepare("INSERT INTO meta (key, value) VALUES (?, ?)");
  for (const [key, value] of Object.entries(meta)) setMeta.run(key, value);

  return db;
}

/**
 * Open an existing .tin file. Refuses files with a newer schema than this
 * code understands; migrations for older files would go here.
 */
export function openTin(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  const { user_version: version } = db
    .prepare("PRAGMA user_version")
    .get() as { user_version: number };

  if (version > SCHEMA_VERSION) {
    db.close();
    throw new Error(
      `Tin file is schema v${version}, this tool only understands up to v${SCHEMA_VERSION}`,
    );
  }
  // ponytail: no migration path yet, nothing below v1 exists. Add
  // step-by-step migrations here when SCHEMA_VERSION moves past 1.

  return db;
}

/** Latest UI html in the file. */
export function latestHtml(db: DatabaseSync): string {
  const row = db
    .prepare("SELECT html FROM ui ORDER BY version DESC LIMIT 1")
    .get() as { html: string } | undefined;
  if (!row) throw new Error("Tin file has no ui rows");
  return row.html;
}
