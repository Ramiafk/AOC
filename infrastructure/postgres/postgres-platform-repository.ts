import type { Pool, PoolClient } from "pg";
import type { DomainEvent } from "../../packages/core/src/events.ts";
import type { EntityId, TenantId } from "../../packages/core/src/identity.ts";
import type { Asset, AssetProps } from "../../packages/assets/src/asset.ts";
import type { OrganizationProps, SiteProps } from "../../packages/organizations/src/organization.ts";
import type { CustomerProps } from "../../packages/customers/src/customer.ts";
import type { PlatformRepository } from "../../apps/api/src/application.ts";

export class PostgresPlatformRepository implements PlatformRepository {
  private readonly pool: Pool;
  constructor(pool: Pool) { this.pool = pool; }

  private async tenantTransaction<T>(tenantId: TenantId, operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async saveOrganization(value: Readonly<OrganizationProps>): Promise<void> {
    await this.tenantTransaction(value.tenantId, client => client.query(
      `INSERT INTO organizations (id, tenant_id, legal_name, display_name, country_code, activities, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [value.id, value.tenantId, value.legalName, value.displayName, value.countryCode, value.activities, value.createdAt]
    ).then(() => undefined));
  }

  async saveSite(value: Readonly<SiteProps>): Promise<void> {
    await this.tenantTransaction(value.tenantId, client => client.query(
      `INSERT INTO sites (id, tenant_id, organization_id, name, country_code, timezone, activities, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [value.id, value.tenantId, value.organizationId, value.name, value.countryCode, value.timezone, value.activities, value.createdAt]
    ).then(() => undefined));
  }

  async saveCustomer(value: Readonly<CustomerProps>): Promise<void> {
    await this.tenantTransaction(value.tenantId, client => client.query(
      `INSERT INTO customers (id, tenant_id, kind, display_name, email, phone, acquisition_channel, acquisition_owner_organization_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [value.id, value.tenantId, value.kind, value.displayName, value.email ?? null, value.phone ?? null, value.acquisitionChannel, value.acquisitionOwnerOrganizationId ?? null, value.createdAt]
    ).then(() => undefined));
  }

  async findOrganization(tenantId: TenantId, id: EntityId): Promise<Readonly<OrganizationProps> | null> {
    return this.tenantTransaction(tenantId, async client => {
      const result = await client.query("SELECT id, tenant_id, legal_name, display_name, country_code, activities, created_at FROM organizations WHERE id = $1", [id]);
      const row = result.rows[0];
      return row ? { id: row.id, tenantId: row.tenant_id, legalName: row.legal_name, displayName: row.display_name, countryCode: row.country_code, activities: row.activities, createdAt: row.created_at.toISOString() } as OrganizationProps : null;
    });
  }

  async save(asset: Asset, event: DomainEvent): Promise<void> {
    const value = asset.snapshot();
    await this.tenantTransaction(value.tenantId, async client => {
      await client.query(
        `INSERT INTO assets (id, tenant_id, owner_customer_id, kind, registration, vin_or_serial, manufacturer, model, first_registration_at, attributes, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [value.id, value.tenantId, value.ownerCustomerId, value.kind, value.registration ?? null, value.vinOrSerial ?? null, value.manufacturer ?? null, value.model ?? null, value.firstRegistrationAt ?? null, value.attributes, value.createdAt]
      );
      await client.query(
        `INSERT INTO outbox_events (id, tenant_id, aggregate_id, event_type, payload, occurred_at)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [event.id, event.tenantId, event.aggregateId, event.type, event.payload, event.occurredAt]
      );
    });
  }

  async findById(tenantId: TenantId, id: EntityId): Promise<Readonly<AssetProps> | null> {
    return this.tenantTransaction(tenantId, async client => {
      const result = await client.query("SELECT * FROM assets WHERE id = $1", [id]);
      const row = result.rows[0];
      return row ? { id: row.id, tenantId: row.tenant_id, ownerCustomerId: row.owner_customer_id, kind: row.kind, registration: row.registration ?? undefined, vinOrSerial: row.vin_or_serial ?? undefined, manufacturer: row.manufacturer ?? undefined, model: row.model ?? undefined, firstRegistrationAt: row.first_registration_at?.toISOString().slice(0, 10), attributes: row.attributes, createdAt: row.created_at.toISOString() } as AssetProps : null;
    });
  }
}
