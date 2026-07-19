import { newEntityId, type EntityId, type RequestContext, type TenantId } from "../../core/src/identity.ts";

export interface AuditEntry {
  id: EntityId;
  tenantId: TenantId;
  actorId: EntityId;
  correlationId: string;
  action: string;
  resourceType: string;
  resourceId: EntityId;
  siteId?: EntityId;
  occurredAt: string;
  metadata: Readonly<Record<string, string | number | boolean>>;
}

export interface AuditSink { append(entry: AuditEntry): Promise<void> }

export class AuditRecorder {
  private readonly sink: AuditSink;
  private readonly now: () => Date;
  constructor(sink: AuditSink, now = () => new Date()) { this.sink = sink; this.now = now; }

  async record(context: RequestContext, input: Omit<AuditEntry, "id" | "tenantId" | "actorId" | "correlationId" | "occurredAt">): Promise<void> {
    await this.sink.append({ id: newEntityId(), tenantId: context.tenantId, actorId: context.actorId, correlationId: context.correlationId, occurredAt: this.now().toISOString(), ...input });
  }
}

export class InMemoryAuditSink implements AuditSink {
  readonly entries: AuditEntry[] = [];
  async append(entry: AuditEntry): Promise<void> { this.entries.push(Object.freeze(entry)); }
}
