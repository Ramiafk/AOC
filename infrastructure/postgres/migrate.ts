import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";

export interface Migration { version: string; name: string; checksum: string; sql: string }

export async function loadMigrations(directory: string): Promise<Migration[]> {
  const names = (await readdir(directory)).filter(name => /^\d+_.+\.sql$/.test(name)).sort();
  const migrations: Migration[] = [];
  for (const name of names) {
    const sql = await readFile(resolve(directory, name), "utf8");
    migrations.push({ version: name.split("_")[0]!, name, checksum: createHash("sha256").update(sql).digest("hex"), sql });
  }
  return migrations;
}

export async function migrate(pool: Pool, migrations: readonly Migration[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(82472601)");
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY, name text NOT NULL, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    for (const migration of migrations) {
      const existing = await client.query("SELECT checksum FROM schema_migrations WHERE version = $1", [migration.version]);
      if (existing.rows[0]) {
        if (existing.rows[0].checksum !== migration.checksum) throw new Error(`MIGRATION_CHECKSUM_MISMATCH:${migration.name}`);
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query("INSERT INTO schema_migrations (version, name, checksum) VALUES ($1,$2,$3)", [migration.version, migration.name, migration.checksum]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(82472601)").catch(() => undefined);
    client.release();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString });
  try { await migrate(pool, await loadMigrations(resolve("infrastructure/postgres"))); }
  finally { await pool.end(); }
}
