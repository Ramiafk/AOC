import type { DomainEvent } from "../../core/src/events.ts";
import type { EntityId, TenantId } from "../../core/src/identity.ts";
import type { Asset, AssetProps } from "./asset.ts";
import type { AssetRepository } from "./register-asset.ts";

export class InMemoryAssetRepository implements AssetRepository {
  readonly events: DomainEvent[] = [];
  private readonly records = new Map<string, Readonly<AssetProps>>();

  async save(asset: Asset, event: DomainEvent): Promise<void> {
    const row = asset.snapshot();
    this.records.set(`${row.tenantId}:${row.id}`, row);
    this.events.push(event);
  }

  async findById(tenantId: TenantId, id: EntityId): Promise<Readonly<AssetProps> | null> {
    return this.records.get(`${tenantId}:${id}`) ?? null;
  }
}
