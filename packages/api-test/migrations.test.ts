import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { loadMigrations } from "../../infrastructure/postgres/migrate.ts";

test("loads ordered immutable PostgreSQL migrations", async () => {
  const migrations = await loadMigrations(resolve("infrastructure/postgres"));
  assert.ok(migrations.length >= 1);
  assert.equal(migrations[0]?.version, "001");
  assert.match(migrations[0]?.checksum ?? "", /^[a-f0-9]{64}$/);
  assert.match(migrations[0]?.sql ?? "", /ROW LEVEL SECURITY/);
});
