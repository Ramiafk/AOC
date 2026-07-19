import { invariant } from "../../core/src/errors.ts";
import { newEntityId, type EntityId, type TenantId, type TenantScoped } from "../../core/src/identity.ts";

export const PERMISSIONS = [
  "organization.manage", "members.manage", "customers.read", "customers.write",
  "assets.read", "assets.write", "appointments.manage", "workshop.manage",
  "commerce.manage", "parts.manage", "billing.manage", "audit.read"
] as const;
export type Permission = typeof PERMISSIONS[number];
export type RoleKey = "owner" | "admin" | "manager" | "advisor" | "technician" | "accountant" | "viewer";

const ROLE_PERMISSIONS: Readonly<Record<RoleKey, readonly Permission[]>> = {
  owner: PERMISSIONS,
  admin: PERMISSIONS.filter(permission => permission !== "organization.manage"),
  manager: ["customers.read", "customers.write", "assets.read", "assets.write", "appointments.manage", "workshop.manage", "commerce.manage", "parts.manage", "billing.manage", "audit.read"],
  advisor: ["customers.read", "customers.write", "assets.read", "assets.write", "appointments.manage", "commerce.manage"],
  technician: ["customers.read", "assets.read", "appointments.manage", "workshop.manage", "parts.manage"],
  accountant: ["customers.read", "assets.read", "billing.manage", "audit.read"],
  viewer: ["customers.read", "assets.read"]
};

export interface MembershipProps extends TenantScoped {
  id: EntityId;
  organizationId: EntityId;
  userId: EntityId;
  role: RoleKey;
  siteIds: readonly EntityId[];
  extraPermissions: readonly Permission[];
  createdAt: string;
}

export class Membership {
  private readonly props: MembershipProps;
  private constructor(props: MembershipProps) { this.props = props; }

  static create(input: Omit<MembershipProps, "id" | "createdAt">, now = new Date()): Membership {
    invariant(input.siteIds.length > 0 || input.role === "owner", "SITE_SCOPE_REQUIRED", "Non-owner members need at least one site scope");
    return new Membership({ ...input, id: newEntityId(), siteIds: Object.freeze([...new Set(input.siteIds)]), extraPermissions: Object.freeze([...new Set(input.extraPermissions)]), createdAt: now.toISOString() });
  }

  snapshot(): Readonly<MembershipProps> { return this.props; }
}

export interface AccessScope { organizationId: EntityId; siteId?: EntityId | undefined }

export function authorize(membership: Readonly<MembershipProps>, tenantId: TenantId, permission: Permission, scope?: AccessScope): void {
  invariant(membership.tenantId === tenantId, "TENANT_ACCESS_DENIED", "Membership does not belong to this tenant");
  const allowed = new Set([...ROLE_PERMISSIONS[membership.role], ...membership.extraPermissions]);
  invariant(allowed.has(permission), "PERMISSION_DENIED", `Missing permission: ${permission}`);
  if (scope) invariant(membership.organizationId === scope.organizationId, "ORGANIZATION_ACCESS_DENIED", "Member does not belong to this organization");
  if (scope?.siteId && membership.role !== "owner") invariant(membership.siteIds.includes(scope.siteId), "SITE_ACCESS_DENIED", "Member is not assigned to this site");
}
