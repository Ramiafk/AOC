import { newEntityId, type EntityId, type RequestContext, type TenantId } from "../../core/src/identity.ts";
import type { DomainEvent } from "../../core/src/events.ts";
import { Asset, type AssetKind, type AssetProps } from "./asset.ts";

export interface RegisterAssetCommand {
  ownerCustomerId: EntityId;
  kind: AssetKind;
  registration?: string | undefined;
  vinOrSerial?: string | undefined;
  manufacturer?: string | undefined;
  model?: string | undefined;
  attributes?: Record<string, string | number | boolean> | undefined;
}

export interface AssetRepository {
  save(asset: Asset, event: DomainEvent): Promise<void>;
  findById(tenantId: TenantId, id: EntityId): Promise<Readonly<AssetProps> | null>;
}

export class RegisterAsset {
  private readonly repository: AssetRepository;
  private readonly now: () => Date;

  constructor(repository: AssetRepository, now = () => new Date()) {
    this.repository = repository;
    this.now = now;
  }

  async execute(context: RequestContext, command: RegisterAssetCommand): Promise<Readonly<AssetProps>> {
    const asset = Asset.create({
      tenantId: context.tenantId,
      ownerCustomerId: command.ownerCustomerId,
      kind: command.kind,
      registration: command.registration,
      vinOrSerial: command.vinOrSerial,
      manufacturer: command.manufacturer,
      model: command.model,
      attributes: Object.freeze({ ...(command.attributes ?? {}) })
    }, this.now());
    const snapshot = asset.snapshot();
    await this.repository.save(asset, {
      id: newEntityId(), tenantId: context.tenantId, aggregateId: snapshot.id,
      type: "asset.registered.v1", occurredAt: this.now().toISOString(),
      payload: { kind: snapshot.kind, ownerCustomerId: snapshot.ownerCustomerId }
    });
    return snapshot;
  }
}
