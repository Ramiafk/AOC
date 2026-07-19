import { invariant } from "../../core/src/errors.ts";
import { newEntityId, type EntityId, type RequestContext, type TenantId, type TenantScoped } from "../../core/src/identity.ts";

export type AcquisitionMode = "purchase" | "trade_in" | "consignment";
export type VehicleStockStatus = "acquired" | "preparing" | "ready" | "published" | "withdrawn" | "sold";
export type PublicationChannel = "professional_website" | "professional_app" | "central_marketplace";

export interface VehicleStockItemProps extends TenantScoped { id: EntityId; organizationId: EntityId; siteId: EntityId; assetId: EntityId; acquisitionMode: AcquisitionMode; acquisitionCostCents: number; askingPriceCents?: number | undefined; status: VehicleStockStatus; createdBy: EntityId; createdAt: string; updatedAt: string }
export interface VehiclePublicationProps extends TenantScoped { id: EntityId; organizationId: EntityId; siteId: EntityId; stockItemId: EntityId; channel: PublicationChannel; askingPriceCents: number; status: "published" | "withdrawn"; publishedBy: EntityId; publishedAt: string }

export interface VehicleCommerceRepository {
  assetExists(tenantId: TenantId, assetId: EntityId): Promise<boolean>;
  siteBelongsToOrganization(tenantId: TenantId, organizationId: EntityId, siteId: EntityId): Promise<boolean>;
  saveStockItem(value: Readonly<VehicleStockItemProps>): Promise<void>;
  findStockItem(tenantId: TenantId, id: EntityId): Promise<Readonly<VehicleStockItemProps> | null>;
  listPublications(tenantId: TenantId, stockItemId: EntityId): Promise<readonly Readonly<VehiclePublicationProps>[]>;
  withStockItemLock<T>(tenantId: TenantId, stockItemId: EntityId, operation: (repository: VehicleCommerceRepository) => Promise<T>): Promise<T>;
  publish(value: Readonly<VehiclePublicationProps>, stockItem: Readonly<VehicleStockItemProps>): Promise<void>;
}

export class ManageVehicleCommerce {
  private readonly repository: VehicleCommerceRepository;
  private readonly now: () => Date;
  constructor(repository: VehicleCommerceRepository, now = () => new Date()) { this.repository=repository; this.now=now; }

  async acquire(context: RequestContext, input: { organizationId: EntityId; siteId: EntityId; assetId: EntityId; acquisitionMode: AcquisitionMode; acquisitionCostCents: number }) {
    invariant(input.acquisitionCostCents >= 0, "INVALID_ACQUISITION_COST", "Acquisition cost must be positive or zero");
    invariant(await this.repository.siteBelongsToOrganization(context.tenantId,input.organizationId,input.siteId), "SITE_SCOPE_MISMATCH", "Site does not belong to this organization");
    invariant(await this.repository.assetExists(context.tenantId,input.assetId), "ASSET_NOT_FOUND", "Asset was not found");
    const now=this.now().toISOString();
    const value: VehicleStockItemProps={id:newEntityId(),tenantId:context.tenantId,...input,status:"acquired",createdBy:context.actorId,createdAt:now,updatedAt:now};
    await this.repository.saveStockItem(value); return value;
  }

  async startPreparation(context: RequestContext, id: EntityId) { return this.transition(context,id,"acquired","preparing","STOCK_ITEM_NOT_ACQUIRED"); }
  async markReady(context: RequestContext, id: EntityId, askingPriceCents: number) { invariant(askingPriceCents>0,"INVALID_ASKING_PRICE","Asking price must be positive"); const value=await this.item(context.tenantId,id); invariant(value.status==="preparing","STOCK_ITEM_NOT_PREPARING","Stock item is not being prepared"); const next={...value,askingPriceCents,status:"ready" as const,updatedAt:this.now().toISOString()}; await this.repository.saveStockItem(next); return next; }

  async publish(context: RequestContext, id: EntityId, channel: PublicationChannel) {
    return this.repository.withStockItemLock(context.tenantId,id,async repository=>{
      const value=await this.item(context.tenantId,id,repository);
      invariant((value.status==="ready"||value.status==="published")&&Boolean(value.askingPriceCents),"STOCK_ITEM_NOT_PUBLISHABLE","Stock item is not ready for publication");
      const publications=await repository.listPublications(context.tenantId,id);
      invariant(!publications.some(item=>item.channel===channel&&item.status==="published"),"CHANNEL_ALREADY_PUBLISHED","Stock item is already published on this channel");
      const publication: VehiclePublicationProps={id:newEntityId(),tenantId:context.tenantId,organizationId:value.organizationId,siteId:value.siteId,stockItemId:value.id,channel,askingPriceCents:value.askingPriceCents!,status:"published",publishedBy:context.actorId,publishedAt:this.now().toISOString()};
      const next={...value,status:"published" as const,updatedAt:this.now().toISOString()}; await repository.publish(publication,next); return {publication,stockItem:next};
    });
  }

  async scope(context: RequestContext,id:EntityId){const value=await this.item(context.tenantId,id);return{organizationId:value.organizationId,siteId:value.siteId};}
  private async transition(context:RequestContext,id:EntityId,from:VehicleStockStatus,to:VehicleStockStatus,code:string){const value=await this.item(context.tenantId,id);invariant(value.status===from,code,"Vehicle stock transition is not allowed");const next={...value,status:to,updatedAt:this.now().toISOString()};await this.repository.saveStockItem(next);return next;}
  private async item(tenantId:TenantId,id:EntityId,repository=this.repository){const value=await repository.findStockItem(tenantId,id);invariant(value,"STOCK_ITEM_NOT_FOUND","Vehicle stock item was not found");return value;}
}
