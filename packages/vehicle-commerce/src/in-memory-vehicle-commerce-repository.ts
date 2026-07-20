import type { EntityId, TenantId } from "../../core/src/identity.ts";
import { DomainError } from "../../core/src/errors.ts";
import type { VehicleCessionDossierProps, VehicleCommerceRepository, VehicleDeliveryProps, VehicleMediaProps, VehicleOwnershipTransferProps, VehiclePreparationCheckProps, VehiclePublicationProps, VehicleSaleProps, VehicleStockItemProps } from "./vehicle-commerce.ts";

export class InMemoryVehicleCommerceRepository implements VehicleCommerceRepository {
  assets=new Set<string>(); assetOwners=new Map<string,EntityId>();documents=new Set<string>();documentKinds=new Map<string,string>();documentOwners=new Map<string,EntityId>();customers=new Set<string>();sites=new Map<string,EntityId>();items:VehicleStockItemProps[]=[];publications:VehiclePublicationProps[]=[];checks:VehiclePreparationCheckProps[]=[];media:VehicleMediaProps[]=[];sales:VehicleSaleProps[]=[];deliveries:VehicleDeliveryProps[]=[];transfers:VehicleOwnershipTransferProps[]=[];cessionDossiers:VehicleCessionDossierProps[]=[];
  private readonly locks=new Map<string,Promise<void>>();
  async assetExists(tenantId:TenantId,assetId:EntityId){return this.assets.has(`${tenantId}:${assetId}`);}
  async siteBelongsToOrganization(tenantId:TenantId,organizationId:EntityId,siteId:EntityId){return this.sites.get(`${tenantId}:${siteId}`)===organizationId;}
  async customerExists(tenantId:TenantId,customerId:EntityId){return this.customers.has(`${tenantId}:${customerId}`);}
  async findSale(tenantId:TenantId,stockItemId:EntityId){return this.sales.find(value=>value.tenantId===tenantId&&value.stockItemId===stockItemId)??null;}
  async findDelivery(tenantId:TenantId,stockItemId:EntityId){return this.deliveries.find(value=>value.tenantId===tenantId&&value.stockItemId===stockItemId)??null;}
  async assetOwnerCustomerId(tenantId:TenantId,assetId:EntityId){return this.assetOwners.get(`${tenantId}:${assetId}`)??null;}
  async documentsBelongToAsset(tenantId:TenantId,assetId:EntityId,documentIds:readonly EntityId[]){return documentIds.every(id=>this.documents.has(`${tenantId}:${assetId}:${id}`));}
  async documentsMatchKinds(tenantId:TenantId,assetId:EntityId,ownerCustomerId:EntityId,documents:Readonly<Record<EntityId,string>>){return Object.entries(documents).every(([id,kind])=>{const key=`${tenantId}:${assetId}:${id}`;return this.documentKinds.get(key)===kind&&this.documentOwners.get(key)===ownerCustomerId;});}
  async findOwnershipTransfer(tenantId:TenantId,stockItemId:EntityId){return this.transfers.find(value=>value.tenantId===tenantId&&value.stockItemId===stockItemId)??null;}
  async findCessionDossier(tenantId:TenantId,stockItemId:EntityId){return this.cessionDossiers.find(value=>value.tenantId===tenantId&&value.stockItemId===stockItemId)??null;}
  async saveStockItem(value:VehicleStockItemProps){this.items=this.items.filter(item=>item.id!==value.id);this.items.push(value);}
  async findStockItem(tenantId:TenantId,id:EntityId){return this.items.find(item=>item.tenantId===tenantId&&item.id===id)??null;}
  async listPublications(tenantId:TenantId,stockItemId:EntityId){return this.publications.filter(item=>item.tenantId===tenantId&&item.stockItemId===stockItemId);}
  async savePreparationCheck(value:VehiclePreparationCheckProps){this.checks=this.checks.filter(item=>item.id!==value.id);this.checks.push(value);}
  async listPreparationChecks(tenantId:TenantId,stockItemId:EntityId){return this.checks.filter(item=>item.tenantId===tenantId&&item.stockItemId===stockItemId);}
  async saveMedia(value:VehicleMediaProps){this.media.push(value);}
  async listMedia(tenantId:TenantId,stockItemId:EntityId){return this.media.filter(item=>item.tenantId===tenantId&&item.stockItemId===stockItemId);}
  async withStockItemLock<T>(tenantId:TenantId,id:EntityId,operation:(repository:VehicleCommerceRepository)=>Promise<T>):Promise<T>{const key=`${tenantId}:${id}`,previous=this.locks.get(key)??Promise.resolve();let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});const tail=previous.then(()=>gate);this.locks.set(key,tail);await previous;try{return await operation(this);}finally{release();if(this.locks.get(key)===tail)this.locks.delete(key);}}
  async publish(value:VehiclePublicationProps,stockItem:VehicleStockItemProps){const snapshot={items:[...this.items],publications:[...this.publications]};try{await this.saveStockItem(stockItem);this.publications.push(value);}catch(error){this.items=snapshot.items;this.publications=snapshot.publications;throw error;}}
  async markReady(stockItem:VehicleStockItemProps,_readyBy:EntityId){await this.saveStockItem(stockItem);}
  async sell(value:VehicleSaleProps,stockItem:VehicleStockItemProps){const snapshot={items:[...this.items],publications:[...this.publications],sales:[...this.sales]};try{await this.saveStockItem(stockItem);this.publications=this.publications.map(item=>item.stockItemId===stockItem.id&&item.status==="published"?{...item,status:"withdrawn"}:item);this.sales.push(value);}catch(error){this.items=snapshot.items;this.publications=snapshot.publications;this.sales=snapshot.sales;throw error;}}
  async saveDelivery(value:VehicleDeliveryProps){this.deliveries.push(value);}
  async completeDelivery(value:VehicleDeliveryProps,stockItem:VehicleStockItemProps){await this.saveStockItem(stockItem);this.deliveries=this.deliveries.map(item=>item.id===value.id?value:item);}
  async transferOwnership(value:VehicleOwnershipTransferProps){this.assetOwners.set(`${value.tenantId}:${value.assetId}`,value.newOwnerCustomerId);this.transfers.push(value);}
  async issueCessionDossier(value:VehicleCessionDossierProps){if(this.cessionDossiers.some(item=>item.tenantId===value.tenantId&&item.stockItemId===value.stockItemId))throw new DomainError("CESSION_DOSSIER_ALREADY_ISSUED","Cession dossier is already issued");this.cessionDossiers.push(value);}
}
