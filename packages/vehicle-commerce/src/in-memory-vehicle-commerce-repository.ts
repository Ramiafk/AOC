import type { EntityId, TenantId } from "../../core/src/identity.ts";
import type { VehicleCommerceRepository, VehiclePublicationProps, VehicleStockItemProps } from "./vehicle-commerce.ts";

export class InMemoryVehicleCommerceRepository implements VehicleCommerceRepository {
  assets=new Set<string>(); sites=new Map<string,EntityId>(); items:VehicleStockItemProps[]=[]; publications:VehiclePublicationProps[]=[];
  private readonly locks=new Map<string,Promise<void>>();
  async assetExists(tenantId:TenantId,assetId:EntityId){return this.assets.has(`${tenantId}:${assetId}`);}
  async siteBelongsToOrganization(tenantId:TenantId,organizationId:EntityId,siteId:EntityId){return this.sites.get(`${tenantId}:${siteId}`)===organizationId;}
  async saveStockItem(value:VehicleStockItemProps){this.items=this.items.filter(item=>item.id!==value.id);this.items.push(value);}
  async findStockItem(tenantId:TenantId,id:EntityId){return this.items.find(item=>item.tenantId===tenantId&&item.id===id)??null;}
  async listPublications(tenantId:TenantId,stockItemId:EntityId){return this.publications.filter(item=>item.tenantId===tenantId&&item.stockItemId===stockItemId);}
  async withStockItemLock<T>(tenantId:TenantId,id:EntityId,operation:(repository:VehicleCommerceRepository)=>Promise<T>):Promise<T>{const key=`${tenantId}:${id}`,previous=this.locks.get(key)??Promise.resolve();let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});const tail=previous.then(()=>gate);this.locks.set(key,tail);await previous;try{return await operation(this);}finally{release();if(this.locks.get(key)===tail)this.locks.delete(key);}}
  async publish(value:VehiclePublicationProps,stockItem:VehicleStockItemProps){const snapshot={items:[...this.items],publications:[...this.publications]};try{await this.saveStockItem(stockItem);this.publications.push(value);}catch(error){this.items=snapshot.items;this.publications=snapshot.publications;throw error;}}
}
