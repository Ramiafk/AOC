import type { Pool } from "pg";
import type { AuditEntry, AuditSink } from "../../packages/audit/src/audit.ts";

export class PostgresAuditSink implements AuditSink {
  private readonly pool: Pool;
  constructor(pool: Pool) { this.pool = pool; }

  async append(entry: AuditEntry): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [entry.tenantId]);
      await client.query(
        `INSERT INTO audit_entries (id, tenant_id, actor_id, correlation_id, action, resource_type, resource_id, site_id, occurred_at, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [entry.id, entry.tenantId, entry.actorId, entry.correlationId, entry.action, entry.resourceType, entry.resourceId, entry.siteId ?? null, entry.occurredAt, entry.metadata]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
