import type { EntityId, TenantId } from "../../core/src/identity.ts";
import type { InventoryRepository } from "./manage-inventory.ts";
import type { GoodsReceiptProps, PartProps, PurchaseOrderProps, StockPositionProps, StockReservationProps, SupplierProps } from "./inventory.ts";

export class InMemoryInventoryRepository implements InventoryRepository {
  parts: PartProps[] = [];
  suppliers: SupplierProps[] = [];
  positions: StockPositionProps[] = [];
  reservations: StockReservationProps[] = [];
  orders: PurchaseOrderProps[] = [];
  receipts: GoodsReceiptProps[] = [];
  private sequence = 0;
  private readonly locks = new Map<string, Promise<void>>();
  async savePart(value: PartProps) { this.parts = this.parts.filter(item => item.id !== value.id); this.parts.push(value); }
  async findPart(tenantId: TenantId, id: EntityId) { return this.parts.find(item => item.tenantId === tenantId && item.id === id) ?? null; }
  async saveSupplier(value: SupplierProps) { this.suppliers = this.suppliers.filter(item => item.id !== value.id); this.suppliers.push(value); }
  async findSupplier(tenantId: TenantId, id: EntityId) { return this.suppliers.find(item => item.tenantId === tenantId && item.id === id) ?? null; }
  async savePosition(value: StockPositionProps) { this.positions = this.positions.filter(item => !(item.tenantId === value.tenantId && item.siteId === value.siteId && item.partId === value.partId)); this.positions.push(value); }
  async findPosition(tenantId: TenantId, siteId: EntityId, partId: EntityId) { return this.positions.find(item => item.tenantId === tenantId && item.siteId === siteId && item.partId === partId) ?? null; }
  async saveReservation(value: StockReservationProps) { this.reservations = this.reservations.filter(item => item.id !== value.id); this.reservations.push(value); }
  async findReservation(tenantId: TenantId, id: EntityId) { return this.reservations.find(item => item.tenantId === tenantId && item.id === id) ?? null; }
  async nextPurchaseNumber(_tenantId: TenantId, _organizationId: EntityId, year: number) { return `CF-${year}-${String(++this.sequence).padStart(5, "0")}`; }
  async savePurchaseOrder(value: PurchaseOrderProps) { this.orders = this.orders.filter(item => item.id !== value.id); this.orders.push(value); }
  async findPurchaseOrder(tenantId: TenantId, id: EntityId) { return this.orders.find(item => item.tenantId === tenantId && item.id === id) ?? null; }
  async listReceipts(tenantId: TenantId, purchaseOrderId: EntityId) { return this.receipts.filter(item => item.tenantId === tenantId && item.purchaseOrderId === purchaseOrderId); }
  async receivePurchaseOrder(receipt: GoodsReceiptProps, positions: readonly StockPositionProps[], order: PurchaseOrderProps) { const snapshot = { orders: [...this.orders], positions: [...this.positions], receipts: [...this.receipts] }; try { for (const position of positions) await this.savePosition(position); await this.savePurchaseOrder(order); this.receipts.push(receipt); } catch (error) { this.orders = snapshot.orders; this.positions = snapshot.positions; this.receipts = snapshot.receipts; throw error; } }
  async withPurchaseOrderLock<T>(tenantId: TenantId, purchaseOrderId: EntityId, operation: (repository: InventoryRepository) => Promise<T>): Promise<T> { const key = `${tenantId}:${purchaseOrderId}`; const previous = this.locks.get(key) ?? Promise.resolve(); let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); const tail = previous.then(() => gate); this.locks.set(key, tail); await previous; try { return await operation(this); } finally { release(); if (this.locks.get(key) === tail) this.locks.delete(key); } }
}
