import { randomUUID } from "node:crypto";
import { invariant } from "./errors.ts";

export type TenantId = string & { readonly __tenant: unique symbol };
export type EntityId = string & { readonly __entity: unique symbol };

export const newEntityId = (): EntityId => randomUUID() as EntityId;
export const tenantId = (value: string): TenantId => {
  invariant(/^[0-9a-f-]{36}$/i.test(value), "INVALID_TENANT_ID", "Tenant identifier must be a UUID");
  return value as TenantId;
};

export interface TenantScoped { tenantId: TenantId }

export interface RequestContext {
  tenantId: TenantId;
  actorId: EntityId;
  correlationId: string;
  verifiedEmail?: string | undefined;
}
