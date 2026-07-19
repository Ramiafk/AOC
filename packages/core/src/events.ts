import type { EntityId, TenantId } from "./identity.ts";

export interface DomainEvent<T extends object = object> {
  id: EntityId;
  tenantId: TenantId;
  aggregateId: EntityId;
  type: string;
  occurredAt: string;
  payload: T;
}
