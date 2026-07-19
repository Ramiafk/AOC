import { invariant } from "../../core/src/errors.ts";
import { newEntityId, type EntityId, type TenantId, type TenantScoped } from "../../core/src/identity.ts";

export const BUSINESS_ACTIVITIES = [
  "vehicle_trade", "workshop", "body_shop", "parts", "rental", "fleet",
  "inspection", "detailing", "transport", "recycling", "insurance",
  "finance", "administrative_services"
] as const;
export type BusinessActivity = typeof BUSINESS_ACTIVITIES[number] | `custom:${string}`;

export interface OrganizationProps extends TenantScoped {
  id: EntityId;
  legalName: string;
  displayName: string;
  countryCode: string;
  activities: readonly BusinessActivity[];
  createdAt: string;
}

export class Organization {
  private readonly props: OrganizationProps;
  private constructor(props: OrganizationProps) { this.props = props; }

  static create(input: Omit<OrganizationProps, "id" | "createdAt">, now = new Date()): Organization {
    invariant(input.legalName.trim().length >= 2, "LEGAL_NAME_REQUIRED", "A legal name is required");
    invariant(/^[A-Z]{2}$/.test(input.countryCode), "INVALID_COUNTRY", "Country code must use ISO alpha-2");
    invariant(input.activities.length > 0, "ACTIVITY_REQUIRED", "At least one activity is required");
    return new Organization({
      ...input,
      id: newEntityId(),
      legalName: input.legalName.trim(),
      displayName: input.displayName.trim() || input.legalName.trim(),
      activities: Object.freeze([...new Set(input.activities)]),
      createdAt: now.toISOString()
    });
  }

  snapshot(): Readonly<OrganizationProps> { return this.props; }
}

export interface SiteProps extends TenantScoped {
  id: EntityId;
  organizationId: EntityId;
  name: string;
  countryCode: string;
  timezone: string;
  activities: readonly BusinessActivity[];
  createdAt: string;
}

export class Site {
  private readonly props: SiteProps;
  private constructor(props: SiteProps) { this.props = props; }

  static create(input: Omit<SiteProps, "id" | "createdAt">, organization: Readonly<OrganizationProps>, now = new Date()): Site {
    invariant(input.tenantId === organization.tenantId, "TENANT_MISMATCH", "Site and organization must share a tenant");
    invariant(input.organizationId === organization.id, "ORGANIZATION_MISMATCH", "Site must belong to the organization");
    invariant(input.name.trim().length >= 2, "SITE_NAME_REQUIRED", "A site name is required");
    invariant(input.activities.every(activity => organization.activities.includes(activity)), "ACTIVITY_NOT_ENABLED", "Site activity must be enabled by its organization");
    return new Site({ ...input, id: newEntityId(), name: input.name.trim(), activities: Object.freeze([...new Set(input.activities)]), createdAt: now.toISOString() });
  }

  snapshot(): Readonly<SiteProps> { return this.props; }
}
