import type { EntityId, RequestContext, TenantId } from "../../../packages/core/src/identity.ts";
import { Organization, Site, type BusinessActivity, type OrganizationProps, type SiteProps } from "../../../packages/organizations/src/organization.ts";
import { Customer, type AcquisitionChannel, type CustomerKind, type CustomerProps } from "../../../packages/customers/src/customer.ts";
import { RegisterAsset, type AssetRepository, type RegisterAssetCommand } from "../../../packages/assets/src/register-asset.ts";
import type { AssetProps } from "../../../packages/assets/src/asset.ts";
import { AuditRecorder } from "../../../packages/audit/src/audit.ts";

export interface PlatformRepository extends AssetRepository {
  saveOrganization(value: Readonly<OrganizationProps>): Promise<void>;
  saveSite(value: Readonly<SiteProps>): Promise<void>;
  saveCustomer(value: Readonly<CustomerProps>): Promise<void>;
  findOrganization(tenantId: TenantId, id: EntityId): Promise<Readonly<OrganizationProps> | null>;
}

export class PlatformApplication {
  private readonly repository: PlatformRepository;
  private readonly audit: AuditRecorder;
  private readonly registerAsset: RegisterAsset;
  constructor(repository: PlatformRepository, audit: AuditRecorder) {
    this.repository = repository;
    this.audit = audit;
    this.registerAsset = new RegisterAsset(repository);
  }

  async createOrganization(context: RequestContext, input: { legalName: string; displayName: string; countryCode: string; activities: BusinessActivity[] }): Promise<Readonly<OrganizationProps>> {
    const value = Organization.create({ tenantId: context.tenantId, ...input }).snapshot();
    await this.repository.saveOrganization(value);
    await this.audit.record(context, { action: "organization.created", resourceType: "organization", resourceId: value.id, metadata: { countryCode: value.countryCode } });
    return value;
  }

  async createSite(context: RequestContext, input: { organizationId: EntityId; name: string; countryCode: string; timezone: string; activities: BusinessActivity[] }): Promise<Readonly<SiteProps>> {
    const organization = await this.repository.findOrganization(context.tenantId, input.organizationId);
    if (!organization) return Promise.reject(new Error("ORGANIZATION_NOT_FOUND"));
    const value = Site.create({ tenantId: context.tenantId, ...input }, organization).snapshot();
    await this.repository.saveSite(value);
    await this.audit.record(context, { action: "site.created", resourceType: "site", resourceId: value.id, siteId: value.id, metadata: { organizationId: value.organizationId } });
    return value;
  }

  async createCustomer(context: RequestContext, input: { kind: CustomerKind; displayName: string; email?: string | undefined; phone?: string | undefined; acquisitionChannel: AcquisitionChannel; acquisitionOwnerOrganizationId?: EntityId | undefined }): Promise<Readonly<CustomerProps>> {
    const value = Customer.create({ tenantId: context.tenantId, ...input }).snapshot();
    await this.repository.saveCustomer(value);
    await this.audit.record(context, { action: "customer.created", resourceType: "customer", resourceId: value.id, metadata: { acquisitionChannel: value.acquisitionChannel } });
    return value;
  }

  async createAsset(context: RequestContext, input: RegisterAssetCommand): Promise<Readonly<AssetProps>> {
    const value = await this.registerAsset.execute(context, input);
    await this.audit.record(context, { action: "asset.created", resourceType: "asset", resourceId: value.id, metadata: { kind: value.kind } });
    return value;
  }
}
