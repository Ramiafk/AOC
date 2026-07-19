import type { DomainEvent } from "../../../packages/core/src/events.ts";
import type { EntityId, TenantId } from "../../../packages/core/src/identity.ts";
import type { Asset, AssetProps } from "../../../packages/assets/src/asset.ts";
import type { OrganizationProps, SiteProps } from "../../../packages/organizations/src/organization.ts";
import type { CustomerProps } from "../../../packages/customers/src/customer.ts";
import type { PlatformRepository } from "./application.ts";

export class InMemoryPlatformRepository implements PlatformRepository {
  readonly events: DomainEvent[] = [];
  readonly organizations = new Map<string, Readonly<OrganizationProps>>();
  readonly sites = new Map<string, Readonly<SiteProps>>();
  readonly customers = new Map<string, Readonly<CustomerProps>>();
  readonly assets = new Map<string, Readonly<AssetProps>>();
  private key(tenantId: TenantId, id: EntityId): string { return `${tenantId}:${id}`; }

  async saveOrganization(value: Readonly<OrganizationProps>): Promise<void> { this.organizations.set(this.key(value.tenantId, value.id), value); }
  async saveSite(value: Readonly<SiteProps>): Promise<void> { this.sites.set(this.key(value.tenantId, value.id), value); }
  async saveCustomer(value: Readonly<CustomerProps>): Promise<void> { this.customers.set(this.key(value.tenantId, value.id), value); }
  async findOrganization(tenantId: TenantId, id: EntityId): Promise<Readonly<OrganizationProps> | null> { return this.organizations.get(this.key(tenantId, id)) ?? null; }
  async save(asset: Asset, event: DomainEvent): Promise<void> { const value = asset.snapshot(); this.assets.set(this.key(value.tenantId, value.id), value); this.events.push(event); }
  async findById(tenantId: TenantId, id: EntityId): Promise<Readonly<AssetProps> | null> { return this.assets.get(this.key(tenantId, id)) ?? null; }
}
