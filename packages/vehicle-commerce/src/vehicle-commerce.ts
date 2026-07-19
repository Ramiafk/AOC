import { invariant } from "../../core/src/errors.ts";
import { newEntityId, type EntityId, type RequestContext, type TenantId, type TenantScoped } from "../../core/src/identity.ts";

export type AcquisitionMode = "purchase" | "trade_in" | "consignment";
export type VehicleStockStatus = "acquired" | "preparing" | "ready" | "published" | "withdrawn" | "sold";
export type PublicationChannel = "professional_website" | "professional_app" | "central_marketplace";

export interface VehicleStockItemProps extends TenantScoped { id: EntityId; organizationId: EntityId; siteId: EntityId; assetId: EntityId; acquisitionMode: AcquisitionMode; acquisitionCostCents: number; askingPriceCents?: number | undefined; status: VehicleStockStatus; createdBy: EntityId; createdAt: string; updatedAt: string }
export interface VehiclePublicationProps extends TenantScoped { id: EntityId; organizationId: EntityId; siteId: EntityId; stockItemId: EntityId; channel: PublicationChannel; askingPriceCents: number; status: "published" | "withdrawn"; publishedBy: EntityId; publishedAt: string }
export interface VehiclePreparationCheckProps extends TenantScoped { id:EntityId; organizationId:EntityId; siteId:EntityId; stockItemId:EntityId; label:string; required:boolean; completedBy?:EntityId|undefined; completedAt?:string|undefined; createdAt:string }
export interface VehicleMediaProps extends TenantScoped { id:EntityId; organizationId:EntityId; siteId:EntityId; stockItemId:EntityId; kind:"image"|"video"; storageKey:string; position:number; primary:boolean; createdBy:EntityId; createdAt:string }

export interface VehicleCommerceRepository {
  assetExists(tenantId: TenantId, assetId: EntityId): Promise<boolean>;
  siteBelongsToOrganization(tenantId: TenantId, organizationId: EntityId, siteId: EntityId): Promise<boolean>;
  saveStockItem(value: Readonly<VehicleStockItemProps>): Promise<void>;
  findStockItem(tenantId: TenantId, id: EntityId): Promise<Readonly<VehicleStockItemProps> | null>;
  listPublications(tenantId: TenantId, stockItemId: EntityId): Promise<readonly Readonly<VehiclePublicationProps>[]>;
  savePreparationCheck(value:Readonly<VehiclePreparationCheckProps>):Promise<void>;
  listPreparationChecks(tenantId:TenantId,stockItemId:EntityId):Promise<readonly Readonly<VehiclePreparationCheckProps>[]>;
  saveMedia(value:Readonly<VehicleMediaProps>):Promise<void>;
  listMedia(tenantId:TenantId,stockItemId:EntityId):Promise<readonly Readonly<VehicleMediaProps>[]>;
  withStockItemLock<T>(tenantId: TenantId, stockItemId: EntityId, operation: (repository: VehicleCommerceRepository) => Promise<T>): Promise<T>;
  publish(value: Readonly<VehiclePublicationProps>, stockItem: Readonly<VehicleStockItemProps>): Promise<void>;
  markReady(stockItem:Readonly<VehicleStockItemProps>,readyBy:EntityId):Promise<void>;
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
  async addPreparationCheck(context:RequestContext,id:EntityId,input:{label:string;required:boolean}){const value=await this.item(context.tenantId,id);invariant(value.status==="preparing","STOCK_ITEM_NOT_PREPARING","Stock item is not being prepared");invariant(input.label.trim().length>=2,"INVALID_PREPARATION_CHECK","Preparation check is invalid");const check:VehiclePreparationCheckProps={id:newEntityId(),tenantId:context.tenantId,organizationId:value.organizationId,siteId:value.siteId,stockItemId:id,label:input.label.trim(),required:input.required,createdAt:this.now().toISOString()};await this.repository.savePreparationCheck(check);return check;}
  async completePreparationCheck(context:RequestContext,stockItemId:EntityId,checkId:EntityId){const value=await this.item(context.tenantId,stockItemId);invariant(value.status==="preparing","STOCK_ITEM_NOT_PREPARING","Stock item is not being prepared");const checks=await this.repository.listPreparationChecks(context.tenantId,stockItemId),check=checks.find(item=>item.id===checkId);invariant(check,"PREPARATION_CHECK_NOT_FOUND","Preparation check was not found");const completed={...check,completedBy:context.actorId,completedAt:this.now().toISOString()};await this.repository.savePreparationCheck(completed);return completed;}
  async addMedia(context:RequestContext,id:EntityId,input:{kind:"image"|"video";storageKey:string;position:number;primary:boolean}){const value=await this.item(context.tenantId,id);invariant(value.status==="preparing"||value.status==="ready","STOCK_ITEM_MEDIA_LOCKED","Media cannot be changed in this state");invariant(input.storageKey.trim().length>=3&&input.position>=0,"INVALID_VEHICLE_MEDIA","Vehicle media is invalid");const media:VehicleMediaProps={id:newEntityId(),tenantId:context.tenantId,organizationId:value.organizationId,siteId:value.siteId,stockItemId:id,...input,storageKey:input.storageKey.trim(),createdBy:context.actorId,createdAt:this.now().toISOString()};await this.repository.saveMedia(media);return media;}
  async markReady(context: RequestContext, id: EntityId, askingPriceCents: number) { invariant(askingPriceCents>0,"INVALID_ASKING_PRICE","Asking price must be positive");return this.repository.withStockItemLock(context.tenantId,id,async repository=>{const value=await this.item(context.tenantId,id,repository);invariant(value.status==="preparing","STOCK_ITEM_NOT_PREPARING","Stock item is not being prepared");const checks=await repository.listPreparationChecks(context.tenantId,id),media=await repository.listMedia(context.tenantId,id);invariant(checks.length>0&&!checks.some(check=>check.required&&!check.completedAt),"PREPARATION_INCOMPLETE","Required preparation checks are incomplete");invariant(media.some(item=>item.primary&&item.kind==="image"),"PRIMARY_IMAGE_REQUIRED","A primary image is required");const next={...value,askingPriceCents,status:"ready" as const,updatedAt:this.now().toISOString()};await repository.markReady(next,context.actorId);return next;}); }

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
