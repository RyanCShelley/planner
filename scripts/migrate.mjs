// Applies db/migrations/*.sql in order, once each, recording them in private.migrations.
// Runs automatically on every production deploy (see "build" in package.json),
// so nobody pastes SQL by hand. Usage: DATABASE_URL=... node scripts/migrate.mjs
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const env = process.env;
const isProd = env.VERCEL_ENV === "production";
const url = env.DATABASE_URL || (isProd ? env.POSTGRES_URL_NON_POOLING : undefined);

if (!url) {
  if (isProd) {
    console.error("migrate: POSTGRES_URL_NON_POOLING is not set for production. Refusing to deploy without migrations.");
    process.exit(1);
  }
  console.log("migrate: no DATABASE_URL and not a production deploy; skipping.");
  process.exit(0);
}

const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
// Strip sslmode from the URL so the ssl option below is the one that applies.
const client = new pg.Client({
  connectionString: url.replace(/([?&])sslmode=[^&]*&?/, "$1").replace(/[?&]$/, ""),
  ssl: local ? false : { rejectUnauthorized: false },
});
await client.connect();

try {
  await client.query(`create schema if not exists private;
    create table if not exists private.migrations (name text primary key, applied_at timestamptz not null default now())`);

  // Production ran 0001 by hand before this script existed: record it instead of re-running it.
  const { rows: boot } = await client.query(`select
      to_regclass('public.areas') is not null as has_areas,
      (select count(*) from private.migrations)::int as n`);
  if (boot[0].has_areas && boot[0].n === 0) {
    await client.query(`insert into private.migrations (name) values ('0001_init.sql') on conflict do nothing`);
    console.log("migrate: existing schema found; recorded 0001_init.sql as applied.");
  }

  const dir = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "db", "migrations");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const { rows } = await client.query("select name from private.migrations");
  const done = new Set(rows.map((r) => r.name));

  for (const f of files) {
    if (done.has(f)) continue;
    const sql = await readFile(path.join(dir, f), "utf8");
    console.log(`migrate: applying ${f}`);
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into private.migrations (name) values ($1)", [f]);
      await client.query("commit");
    } catch (e) {
      await client.query("rollback");
      throw new Error(`${f}: ${e.message}`);
    }
  }
  console.log("migrate: up to date.");
} finally {
  await client.end();
}
