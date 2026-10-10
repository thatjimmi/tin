#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { createTin, openTin, latestHtml } from "@tin/format/src/index.ts";

const [command, ...rest] = process.argv.slice(2);

function usage(): never {
  console.error(
    [
      "Usage:",
      "  tin pack <index.html> -o <app.tin>",
      "  tin unpack <app.tin> -o <out-dir>",
      "  tin inspect <app.tin>",
      "  tin dump <app.tin> --collection <name>",
    ].join("\n"),
  );
  process.exit(1);
}

function flags(args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    options: {
      out: { type: "string", short: "o" },
      collection: { type: "string" },
    },
    allowPositionals: true,
  });
  return { values, positionals };
}

switch (command) {
  case "pack": {
    const { values, positionals } = flags(rest);
    const [input] = positionals;
    if (!input || !values.out) usage();
    const html = readFileSync(input, "utf8");
    const db = createTin(values.out, html, { title: input });
    db.close();
    console.log(`Wrote ${values.out}`);
    break;
  }

  case "unpack": {
    const { values, positionals } = flags(rest);
    const [input] = positionals;
    if (!input || !values.out) usage();
    const db = openTin(input);
    const html = latestHtml(db);
    db.close();
    mkdirSync(values.out, { recursive: true });
    writeFileSync(join(values.out, "index.html"), html);
    console.log(`Wrote ${values.out}/index.html`);
    break;
  }

  case "inspect": {
    const [input] = rest;
    if (!input) usage();
    const db = openTin(input);
    const meta = db.prepare("SELECT key, value FROM meta").all();
    const versions = db
      .prepare("SELECT version, created_at FROM ui ORDER BY version")
      .all();
    const counts = db
      .prepare("SELECT collection, COUNT(*) as n FROM docs WHERE _deleted = 0 GROUP BY collection")
      .all();
    db.close();
    console.log(JSON.stringify({ meta, versions, docs: counts }, null, 2));
    break;
  }

  case "dump": {
    const { values, positionals } = flags(rest);
    const [input] = positionals;
    if (!input || !values.collection) usage();
    const db = openTin(input);
    const rows = db
      .prepare("SELECT _id, data FROM docs WHERE collection = ? AND _deleted = 0")
      .all(values.collection);
    db.close();
    console.log(
      JSON.stringify(
        rows.map((r: any) => ({ _id: r._id, ...JSON.parse(r.data) })),
        null,
        2,
      ),
    );
    break;
  }

  default:
    usage();
}
