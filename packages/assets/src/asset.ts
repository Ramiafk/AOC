import { invariant } from "../../core/src/errors.ts";
import { newEntityId, type EntityId, type TenantId, type TenantScoped } from "../../core/src/identity.ts";

export const BUILT_IN_ASSET_KINDS = [
  "car", "motorcycle", "scooter", "quad", "boat", "jet_ski",
  "motorhome", "caravan", "van", "truck"
] as const;

export type BuiltInAssetKind = typeof BUILT_IN_ASSET_KINDS[number];
export type AssetKind = BuiltInAssetKind | `custom:${string}`;

export interface AssetProps extends TenantScoped {
  id: EntityId;
  ownerCustomerId: EntityId;
  kind: AssetKind;
  registration?: string | undefined;
  vinOrSerial?: string | undefined;
  manufacturer?: string | undefined;
  model?: string | undefined;
  firstRegistrationAt?: string | undefined;
  attributes: Readonly<Record<string, string | number | boolean>>;
  createdAt: string;
}

export class Asset {
  private readonly props: AssetProps;

  private constructor(props: AssetProps) { this.props = props; }

  static create(input: Omit<AssetProps, "id" | "createdAt">, now = new Date()): Asset {
    invariant(input.kind.length > 0, "ASSET_KIND_REQUIRED", "An asset kind is required");
    invariant(Boolean(input.registration || input.vinOrSerial), "ASSET_IDENTIFIER_REQUIRED", "Registration or VIN/serial is required");
    return new Asset({ ...input, id: newEntityId(), createdAt: now.toISOString() });
  }

  snapshot(): Readonly<AssetProps> { return this.props; }
}
