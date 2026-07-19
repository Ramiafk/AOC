import type { Pool, PoolClient } from "pg";
import type { EntityId, TenantId } from "../../packages/core/src/identity.ts";
import type { InventoryRepository } from "../../packages/inventory/src/manage-inventory.ts";
import type { GoodsReceiptProps, PartProps, PurchaseOrderProps, ReplenishmentAlertProps, StockPositionProps, StockReservationProps, SupplierProps, SupplierReturnProps } from "../../packages/inventory/src/inventory.ts";

export class PostgresInventoryRepository implements InventoryRepository {
  private readonly pool: Pool;
  private readonly transaction: PoolClient | undefined;
  constructor(pool: Pool, transaction?: PoolClient) { this.pool = pool; this.transaction = transaction; }

  private async tenantTransaction<T>(tenantId: TenantId, operation: (client: PoolClient) => Promise<T>): Promise<T> {
    if (this.transaction) return operation(this.transaction);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async savePart(value: Readonly<PartProps>) { await this.tenantTransaction(value.tenantId, client => client.query(`INSERT INTO parts(id,tenant_id,organization_id,sku,name,unit_cost_cents,sale_price_cents,reorder_point,reorder_quantity,active,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,unit_cost_cents=EXCLUDED.unit_cost_cents,sale_price_cents=EXCLUDED.sale_price_cents,reorder_point=EXCLUDED.reorder_point,reorder_quantity=EXCLUDED.reorder_quantity,active=EXCLUDED.active`, [value.id,value.tenantId,value.organizationId,value.sku,value.name,value.unitCostCents,value.salePriceCents,value.reorderPoint,value.reorderQuantity,value.active,value.createdAt]).then(() => undefined)); }
  async findPart(tenantId: TenantId, id: EntityId) { return this.tenantTransaction(tenantId, async client => { const result = await client.query(`SELECT id,tenant_id AS "tenantId",organization_id AS "organizationId",sku,name,unit_cost_cents AS "unitCostCents",sale_price_cents AS "salePriceCents",reorder_point::float8 AS "reorderPoint",reorder_quantity::float8 AS "reorderQuantity",active,created_at AS "createdAt" FROM parts WHERE tenant_id=$1 AND id=$2`, [tenantId,id]); return (result.rows[0] as PartProps | undefined) ?? null; }); }
  async saveSupplier(value: Readonly<SupplierProps>) { await this.tenantTransaction(value.tenantId, client => client.query(`INSERT INTO suppliers(id,tenant_id,organization_id,code,name,email,active,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,email=EXCLUDED.email,active=EXCLUDED.active`, [value.id,value.tenantId,value.organizationId,value.code,value.name,value.email??null,value.active,value.createdAt]).then(() => undefined)); }
  async findSupplier(tenantId: TenantId, id: EntityId) { return this.tenantTransaction(tenantId, async client => { const result = await client.query(`SELECT id,tenant_id AS "tenantId",organization_id AS "organizationId",code,name,email,active,created_at AS "createdAt" FROM suppliers WHERE tenant_id=$1 AND id=$2`, [tenantId,id]); return (result.rows[0] as SupplierProps | undefined) ?? null; }); }
  async savePosition(value: Readonly<StockPositionProps>) { await this.tenantTransaction(value.tenantId, client => client.query(`INSERT INTO stock_positions(tenant_id,site_id,part_id,on_hand,reserved,average_unit_cost_cents,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(tenant_id,site_id,part_id) DO UPDATE SET on_hand=EXCLUDED.on_hand,reserved=EXCLUDED.reserved,average_unit_cost_cents=EXCLUDED.average_unit_cost_cents,updated_at=EXCLUDED.updated_at`, [value.tenantId,value.siteId,value.partId,value.onHand,value.reserved,value.averageUnitCostCents,value.updatedAt]).then(() => undefined)); }
  async findPosition(tenantId: TenantId, siteId: EntityId, partId: EntityId) { return this.tenantTransaction(tenantId, async client => { const result = await client.query(`SELECT tenant_id AS "tenantId",site_id AS "siteId",part_id AS "partId",on_hand::float8 AS "onHand",reserved::float8 AS reserved,average_unit_cost_cents AS "averageUnitCostCents",updated_at AS "updatedAt" FROM stock_positions WHERE tenant_id=$1 AND site_id=$2 AND part_id=$3`, [tenantId,siteId,partId]); return (result.rows[0] as StockPositionProps | undefined) ?? null; }); }
  async saveReservation(value: Readonly<StockReservationProps>) { await this.tenantTransaction(value.tenantId, client => client.query(`INSERT INTO stock_reservations(id,tenant_id,site_id,part_id,work_order_id,quantity,status,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status`, [value.id,value.tenantId,value.siteId,value.partId,value.workOrderId,value.quantity,value.status,value.createdAt]).then(() => undefined)); }
  async findReservation(tenantId: TenantId, id: EntityId) { return this.tenantTransaction(tenantId, async client => { const result = await client.query(`SELECT id,tenant_id AS "tenantId",site_id AS "siteId",part_id AS "partId",work_order_id AS "workOrderId",quantity::float8 AS quantity,status,created_at AS "createdAt" FROM stock_reservations WHERE tenant_id=$1 AND id=$2`, [tenantId,id]); return (result.rows[0] as StockReservationProps | undefined) ?? null; }); }
  async nextPurchaseNumber(tenantId: TenantId, organizationId: EntityId, year: number) { return this.tenantTransaction(tenantId, async client => { const result = await client.query(`INSERT INTO purchase_sequences(tenant_id,organization_id,year,value) VALUES($1,$2,$3,1) ON CONFLICT(tenant_id,organization_id,year) DO UPDATE SET value=purchase_sequences.value+1 RETURNING value`, [tenantId,organizationId,year]); return `CF-${year}-${String(result.rows[0].value).padStart(5,"0")}`; }); }
  async savePurchaseOrder(value: Readonly<PurchaseOrderProps>) { await this.tenantTransaction(value.tenantId, client => client.query(`INSERT INTO purchase_orders(id,tenant_id,organization_id,site_id,supplier_id,number,lines,status,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status`, [value.id,value.tenantId,value.organizationId,value.siteId,value.supplierId,value.number,JSON.stringify(value.lines),value.status,value.createdAt]).then(() => undefined)); }
  async findPurchaseOrder(tenantId: TenantId, id: EntityId) { return this.tenantTransaction(tenantId, async client => { const result = await client.query(`SELECT id,tenant_id AS "tenantId",organization_id AS "organizationId",site_id AS "siteId",supplier_id AS "supplierId",number,lines,status,created_at AS "createdAt" FROM purchase_orders WHERE tenant_id=$1 AND id=$2`, [tenantId,id]); return (result.rows[0] as PurchaseOrderProps | undefined) ?? null; }); }
  async listReceipts(tenantId: TenantId, purchaseOrderId: EntityId) { return this.tenantTransaction(tenantId, async client => { const result = await client.query(`SELECT r.id,r.tenant_id AS "tenantId",r.organization_id AS "organizationId",r.site_id AS "siteId",r.purchase_order_id AS "purchaseOrderId",r.supplier_id AS "supplierId",r.received_by AS "receivedBy",r.received_at AS "receivedAt",COALESCE(jsonb_agg(jsonb_build_object('partId',l.part_id,'quantity',l.quantity::float8,'unitCostCents',l.unit_cost_cents)) FILTER(WHERE l.part_id IS NOT NULL),'[]') AS lines FROM goods_receipts r LEFT JOIN goods_receipt_lines l ON l.tenant_id=r.tenant_id AND l.receipt_id=r.id WHERE r.tenant_id=$1 AND r.purchase_order_id=$2 GROUP BY r.id`, [tenantId,purchaseOrderId]); return result.rows as GoodsReceiptProps[]; }); }
  async listReturns(tenantId: TenantId, purchaseOrderId: EntityId) { return this.tenantTransaction(tenantId, async client => { const result = await client.query(`SELECT r.id,r.tenant_id AS "tenantId",r.organization_id AS "organizationId",r.site_id AS "siteId",r.purchase_order_id AS "purchaseOrderId",r.supplier_id AS "supplierId",r.reason,r.returned_by AS "returnedBy",r.returned_at AS "returnedAt",COALESCE(jsonb_agg(jsonb_build_object('partId',l.part_id,'quantity',l.quantity::float8)) FILTER(WHERE l.part_id IS NOT NULL),'[]') AS lines FROM supplier_returns r LEFT JOIN supplier_return_lines l ON l.tenant_id=r.tenant_id AND l.supplier_return_id=r.id WHERE r.tenant_id=$1 AND r.purchase_order_id=$2 GROUP BY r.id`, [tenantId,purchaseOrderId]); return result.rows as SupplierReturnProps[]; }); }
  async listReplenishmentAlerts(tenantId: TenantId, organizationId: EntityId, siteId: EntityId) { return this.tenantTransaction(tenantId, async client => { const result = await client.query(`SELECT p.tenant_id AS "tenantId",p.organization_id AS "organizationId",site.id AS "siteId",p.id AS "partId",p.sku,p.name,(COALESCE(s.on_hand,0)-COALESCE(s.reserved,0))::float8 AS available,p.reorder_point::float8 AS "reorderPoint",p.reorder_quantity::float8 AS "suggestedQuantity" FROM parts p JOIN sites site ON site.tenant_id=p.tenant_id AND site.organization_id=p.organization_id AND site.id=$3 LEFT JOIN stock_positions s ON s.tenant_id=p.tenant_id AND s.part_id=p.id AND s.site_id=site.id WHERE p.tenant_id=$1 AND p.organization_id=$2 AND p.active AND COALESCE(s.on_hand,0)-COALESCE(s.reserved,0)<=p.reorder_point ORDER BY p.sku`, [tenantId,organizationId,siteId]); return result.rows as ReplenishmentAlertProps[]; }); }

  async withPurchaseOrderLock<T>(tenantId: TenantId, purchaseOrderId: EntityId, operation: (repository: InventoryRepository) => Promise<T>): Promise<T> {
    return this.tenantTransaction(tenantId, async client => {
      await client.query(`SELECT id FROM purchase_orders WHERE tenant_id=$1 AND id=$2 FOR UPDATE`, [tenantId,purchaseOrderId]);
      return operation(new PostgresInventoryRepository(this.pool, client));
    });
  }

  async receivePurchaseOrder(receipt: Readonly<GoodsReceiptProps>, positions: readonly Readonly<StockPositionProps>[], order: Readonly<PurchaseOrderProps>) {
    await this.tenantTransaction(receipt.tenantId, async client => {
      await client.query(`INSERT INTO goods_receipts(id,tenant_id,organization_id,site_id,purchase_order_id,supplier_id,received_by,received_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [receipt.id,receipt.tenantId,receipt.organizationId,receipt.siteId,receipt.purchaseOrderId,receipt.supplierId,receipt.receivedBy,receipt.receivedAt]);
      for (const line of receipt.lines) await client.query(`INSERT INTO goods_receipt_lines(tenant_id,receipt_id,part_id,quantity,unit_cost_cents) VALUES($1,$2,$3,$4,$5)`, [receipt.tenantId,receipt.id,line.partId,line.quantity,line.unitCostCents]);
      for (const value of positions) await client.query(`INSERT INTO stock_positions(tenant_id,site_id,part_id,on_hand,reserved,average_unit_cost_cents,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(tenant_id,site_id,part_id) DO UPDATE SET on_hand=EXCLUDED.on_hand,reserved=EXCLUDED.reserved,average_unit_cost_cents=EXCLUDED.average_unit_cost_cents,updated_at=EXCLUDED.updated_at`, [value.tenantId,value.siteId,value.partId,value.onHand,value.reserved,value.averageUnitCostCents,value.updatedAt]);
      await client.query(`UPDATE purchase_orders SET status=$3 WHERE tenant_id=$1 AND id=$2`, [order.tenantId,order.id,order.status]);
      await client.query(`INSERT INTO outbox_events(id,tenant_id,aggregate_id,event_type,payload,occurred_at) VALUES(gen_random_uuid(),$1,$2,'inventory.goods_received.v1',$3,$4)`, [receipt.tenantId,receipt.id,JSON.stringify({organizationId:receipt.organizationId,siteId:receipt.siteId,purchaseOrderId:receipt.purchaseOrderId,status:order.status}),receipt.receivedAt]);
    });
  }

  async closePurchaseOrder(order: Readonly<PurchaseOrderProps>, closedBy: EntityId, closedAt: string) {
    await this.tenantTransaction(order.tenantId, async client => {
      await client.query(`UPDATE purchase_orders SET status=$3 WHERE tenant_id=$1 AND id=$2`, [order.tenantId,order.id,order.status]);
      await client.query(`INSERT INTO outbox_events(id,tenant_id,aggregate_id,event_type,payload,occurred_at) VALUES(gen_random_uuid(),$1,$2,'inventory.purchase_remainder_closed.v1',$3,$4)`, [order.tenantId,order.id,JSON.stringify({organizationId:order.organizationId,siteId:order.siteId,status:order.status,closedBy}),closedAt]);
    });
  }

  async returnPurchaseOrder(value: Readonly<SupplierReturnProps>, positions: readonly Readonly<StockPositionProps>[]) {
    await this.tenantTransaction(value.tenantId, async client => {
      await client.query(`INSERT INTO supplier_returns(id,tenant_id,organization_id,site_id,purchase_order_id,supplier_id,reason,returned_by,returned_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [value.id,value.tenantId,value.organizationId,value.siteId,value.purchaseOrderId,value.supplierId,value.reason,value.returnedBy,value.returnedAt]);
      for (const line of value.lines) await client.query(`INSERT INTO supplier_return_lines(tenant_id,supplier_return_id,part_id,quantity) VALUES($1,$2,$3,$4)`, [value.tenantId,value.id,line.partId,line.quantity]);
      for (const position of positions) await client.query(`UPDATE stock_positions SET on_hand=$4,updated_at=$5 WHERE tenant_id=$1 AND site_id=$2 AND part_id=$3`, [position.tenantId,position.siteId,position.partId,position.onHand,position.updatedAt]);
      await client.query(`INSERT INTO outbox_events(id,tenant_id,aggregate_id,event_type,payload,occurred_at) VALUES(gen_random_uuid(),$1,$2,'inventory.supplier_returned.v1',$3,$4)`, [value.tenantId,value.id,JSON.stringify({organizationId:value.organizationId,siteId:value.siteId,purchaseOrderId:value.purchaseOrderId,supplierId:value.supplierId}),value.returnedAt]);
    });
  }
}
