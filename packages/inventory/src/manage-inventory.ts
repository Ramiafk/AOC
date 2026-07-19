import { invariant } from "../../core/src/errors.ts";
import { newEntityId, type EntityId, type RequestContext, type TenantId } from "../../core/src/identity.ts";
import { Part, Supplier, available, weightedAverageCost, type GoodsReceiptLine, type GoodsReceiptProps, type PartProps, type PurchaseOrderProps, type ReplenishmentAlertProps, type StockPositionProps, type StockReservationProps, type SupplierProps, type SupplierReturnLine, type SupplierReturnProps } from "./inventory.ts";

export interface InventoryRepository {
  savePart(value: Readonly<PartProps>): Promise<void>;
  findPart(tenantId: TenantId, id: EntityId): Promise<Readonly<PartProps> | null>;
  saveSupplier(value: Readonly<SupplierProps>): Promise<void>;
  findSupplier(tenantId: TenantId, id: EntityId): Promise<Readonly<SupplierProps> | null>;
  savePosition(value: Readonly<StockPositionProps>): Promise<void>;
  findPosition(tenantId: TenantId, siteId: EntityId, partId: EntityId): Promise<Readonly<StockPositionProps> | null>;
  saveReservation(value: Readonly<StockReservationProps>): Promise<void>;
  findReservation(tenantId: TenantId, id: EntityId): Promise<Readonly<StockReservationProps> | null>;
  nextPurchaseNumber(tenantId: TenantId, organizationId: EntityId, year: number): Promise<string>;
  savePurchaseOrder(value: Readonly<PurchaseOrderProps>): Promise<void>;
  findPurchaseOrder(tenantId: TenantId, id: EntityId): Promise<Readonly<PurchaseOrderProps> | null>;
  listReceipts(tenantId: TenantId, purchaseOrderId: EntityId): Promise<readonly Readonly<GoodsReceiptProps>[]>;
  listReturns(tenantId: TenantId, purchaseOrderId: EntityId): Promise<readonly Readonly<SupplierReturnProps>[]>;
  listReplenishmentAlerts(tenantId: TenantId, organizationId: EntityId, siteId: EntityId): Promise<readonly Readonly<ReplenishmentAlertProps>[]>;
  receivePurchaseOrder(receipt: Readonly<GoodsReceiptProps>, positions: readonly Readonly<StockPositionProps>[], order: Readonly<PurchaseOrderProps>): Promise<void>;
  closePurchaseOrder(order: Readonly<PurchaseOrderProps>, closedBy: EntityId, closedAt: string): Promise<void>;
  returnPurchaseOrder(value: Readonly<SupplierReturnProps>, positions: readonly Readonly<StockPositionProps>[]): Promise<void>;
  withPurchaseOrderLock<T>(tenantId: TenantId, purchaseOrderId: EntityId, operation: (repository: InventoryRepository) => Promise<T>): Promise<T>;
}

export class ManageInventory {
  private readonly repository: InventoryRepository;
  private readonly now: () => Date;
  constructor(repository: InventoryRepository, now = () => new Date()) { this.repository = repository; this.now = now; }

  async createPart(context: RequestContext, input: Omit<PartProps, "id" | "tenantId" | "active" | "createdAt">) { const value = Part.create({ tenantId: context.tenantId, ...input }, this.now()); await this.repository.savePart(value); return value; }
  async createSupplier(context: RequestContext, input: Omit<SupplierProps, "id" | "tenantId" | "active" | "createdAt">) { const value = Supplier.create({ tenantId: context.tenantId, ...input }, this.now()); await this.repository.saveSupplier(value); return value; }

  async receive(context: RequestContext, siteId: EntityId, partId: EntityId, quantity: number) { invariant(quantity > 0, "INVALID_STOCK_QUANTITY", "Quantity must be positive"); const position = await this.position(context.tenantId, siteId, partId); const value = { ...position, onHand: position.onHand + quantity, updatedAt: this.now().toISOString() }; await this.repository.savePosition(value); return value; }
  async reserve(context: RequestContext, input: { siteId: EntityId; partId: EntityId; workOrderId: EntityId; quantity: number }) { invariant(input.quantity > 0, "INVALID_STOCK_QUANTITY", "Quantity must be positive"); const position = await this.position(context.tenantId, input.siteId, input.partId); invariant(available(position) >= input.quantity, "INSUFFICIENT_STOCK", "Not enough available stock"); await this.repository.savePosition({ ...position, reserved: position.reserved + input.quantity, updatedAt: this.now().toISOString() }); const value: StockReservationProps = { id: newEntityId(), tenantId: context.tenantId, ...input, status: "reserved", createdAt: this.now().toISOString() }; await this.repository.saveReservation(value); return value; }
  async consume(context: RequestContext, id: EntityId) { const value = await this.reservation(context.tenantId, id); invariant(value.status === "reserved", "RESERVATION_NOT_ACTIVE", "Reservation is not active"); const position = await this.position(context.tenantId, value.siteId, value.partId); await this.repository.savePosition({ ...position, onHand: position.onHand - value.quantity, reserved: position.reserved - value.quantity, updatedAt: this.now().toISOString() }); const next = { ...value, status: "consumed" as const }; await this.repository.saveReservation(next); return next; }
  async release(context: RequestContext, id: EntityId) { const value = await this.reservation(context.tenantId, id); invariant(value.status === "reserved", "RESERVATION_NOT_ACTIVE", "Reservation is not active"); const position = await this.position(context.tenantId, value.siteId, value.partId); await this.repository.savePosition({ ...position, reserved: position.reserved - value.quantity, updatedAt: this.now().toISOString() }); const next = { ...value, status: "released" as const }; await this.repository.saveReservation(next); return next; }

  async createPurchaseOrder(context: RequestContext, input: { organizationId: EntityId; siteId: EntityId; supplierId: EntityId; lines: PurchaseOrderProps["lines"] }) {
    invariant(input.lines.length > 0 && input.lines.every(line => line.quantity > 0 && line.unitCostCents >= 0), "INVALID_PURCHASE_ORDER", "Purchase order is invalid");
    invariant(new Set(input.lines.map(line => line.partId)).size === input.lines.length, "DUPLICATE_PART_LINE", "A part can appear only once in a purchase order");
    const supplier = await this.repository.findSupplier(context.tenantId, input.supplierId);
    invariant(supplier?.active && supplier.organizationId === input.organizationId, "SUPPLIER_SCOPE_MISMATCH", "Supplier does not belong to this organization");
    for (const line of input.lines) { const part = await this.repository.findPart(context.tenantId, line.partId); invariant(part?.organizationId === input.organizationId, "PART_SCOPE_MISMATCH", "Part does not belong to this organization"); }
    const number = await this.repository.nextPurchaseNumber(context.tenantId, input.organizationId, this.now().getUTCFullYear());
    const value: PurchaseOrderProps = { id: newEntityId(), tenantId: context.tenantId, ...input, number, status: "draft", createdAt: this.now().toISOString() };
    await this.repository.savePurchaseOrder(value); return value;
  }

  async order(context: RequestContext, id: EntityId) { const value = await this.purchaseOrder(context.tenantId, id); invariant(value.status === "draft", "PURCHASE_ORDER_NOT_DRAFT", "Only a draft order can be submitted"); const next = { ...value, status: "ordered" as const }; await this.repository.savePurchaseOrder(next); return next; }

  async receivePurchaseOrder(context: RequestContext, purchaseOrderId: EntityId, lines: readonly GoodsReceiptLine[]) {
    invariant(new Set(lines.map(line => line.partId)).size === lines.length, "DUPLICATE_PART_LINE", "A part can appear only once in a receipt");
    return this.repository.withPurchaseOrderLock(context.tenantId, purchaseOrderId, repository => this.receiveLocked(repository, context, purchaseOrderId, lines));
  }

  private async receiveLocked(repository: InventoryRepository, context: RequestContext, purchaseOrderId: EntityId, lines: readonly GoodsReceiptLine[]) {
    const order = await this.purchaseOrder(context.tenantId, purchaseOrderId, repository);
    invariant(order.status === "ordered" || order.status === "partially_received", "PURCHASE_ORDER_NOT_RECEIVABLE", "Purchase order cannot be received");
    invariant(lines.length > 0 && lines.every(line => line.quantity > 0 && line.unitCostCents >= 0), "INVALID_RECEIPT", "Receipt is invalid");
    const previous = await repository.listReceipts(context.tenantId, order.id);
    const received = new Map<EntityId, number>();
    for (const receipt of previous) for (const line of receipt.lines) received.set(line.partId, (received.get(line.partId) ?? 0) + line.quantity);
    const positions: StockPositionProps[] = [];
    for (const line of lines) {
      const ordered = order.lines.find(value => value.partId === line.partId);
      invariant(ordered && (received.get(line.partId) ?? 0) + line.quantity <= ordered.quantity, "RECEIPT_EXCEEDS_ORDER", "Receipt exceeds ordered quantity");
      const current = await this.position(context.tenantId, order.siteId, line.partId, repository);
      positions.push({ ...current, onHand: current.onHand + line.quantity, averageUnitCostCents: weightedAverageCost(current, line.quantity, line.unitCostCents), updatedAt: this.now().toISOString() });
      received.set(line.partId, (received.get(line.partId) ?? 0) + line.quantity);
    }
    const complete = order.lines.every(line => (received.get(line.partId) ?? 0) === line.quantity);
    const nextOrder = { ...order, status: complete ? "received" as const : "partially_received" as const };
    const receipt: GoodsReceiptProps = { id: newEntityId(), tenantId: context.tenantId, organizationId: order.organizationId, siteId: order.siteId, purchaseOrderId: order.id, supplierId: order.supplierId, lines: Object.freeze([...lines]), receivedBy: context.actorId, receivedAt: this.now().toISOString() };
    await repository.receivePurchaseOrder(receipt, positions, nextOrder); return { receipt, order: nextOrder, positions };
  }

  async cancelRemainder(context: RequestContext, purchaseOrderId: EntityId) {
    return this.repository.withPurchaseOrderLock(context.tenantId, purchaseOrderId, async repository => {
      const order = await this.purchaseOrder(context.tenantId, purchaseOrderId, repository);
      invariant(order.status === "ordered" || order.status === "partially_received", "PURCHASE_ORDER_NOT_CLOSABLE", "Purchase order remainder cannot be closed");
      const receipts = await repository.listReceipts(context.tenantId, order.id);
      const next = { ...order, status: receipts.length === 0 ? "cancelled" as const : "closed" as const };
      await repository.closePurchaseOrder(next, context.actorId, this.now().toISOString());
      return next;
    });
  }

  async returnToSupplier(context: RequestContext, purchaseOrderId: EntityId, lines: readonly SupplierReturnLine[], reason: string) {
    invariant(lines.length > 0 && lines.every(line => line.quantity > 0), "INVALID_SUPPLIER_RETURN", "Supplier return is invalid");
    invariant(reason.trim().length >= 3, "INVALID_SUPPLIER_RETURN_REASON", "Supplier return reason is required");
    invariant(new Set(lines.map(line => line.partId)).size === lines.length, "DUPLICATE_PART_LINE", "A part can appear only once in a supplier return");
    return this.repository.withPurchaseOrderLock(context.tenantId, purchaseOrderId, async repository => {
      const order = await this.purchaseOrder(context.tenantId, purchaseOrderId, repository);
      invariant(order.status === "partially_received" || order.status === "received" || order.status === "closed", "PURCHASE_ORDER_NOT_RETURNABLE", "Purchase order has no returnable receipt");
      const receipts = await repository.listReceipts(context.tenantId, order.id);
      const previousReturns = await repository.listReturns(context.tenantId, order.id);
      const received = new Map<EntityId, number>();
      const returned = new Map<EntityId, number>();
      for (const receipt of receipts) for (const line of receipt.lines) received.set(line.partId, (received.get(line.partId) ?? 0) + line.quantity);
      for (const value of previousReturns) for (const line of value.lines) returned.set(line.partId, (returned.get(line.partId) ?? 0) + line.quantity);
      const positions: StockPositionProps[] = [];
      for (const line of lines) {
        invariant((returned.get(line.partId) ?? 0) + line.quantity <= (received.get(line.partId) ?? 0), "RETURN_EXCEEDS_RECEIPTS", "Supplier return exceeds received quantity");
        const position = await this.position(context.tenantId, order.siteId, line.partId, repository);
        invariant(available(position) >= line.quantity, "INSUFFICIENT_RETURNABLE_STOCK", "Not enough unreserved stock to return");
        positions.push({ ...position, onHand: position.onHand - line.quantity, updatedAt: this.now().toISOString() });
      }
      const value: SupplierReturnProps = { id: newEntityId(), tenantId: context.tenantId, organizationId: order.organizationId, siteId: order.siteId, purchaseOrderId: order.id, supplierId: order.supplierId, lines: Object.freeze([...lines]), reason: reason.trim(), returnedBy: context.actorId, returnedAt: this.now().toISOString() };
      await repository.returnPurchaseOrder(value, positions);
      return { supplierReturn: value, positions };
    });
  }

  async replenishmentAlerts(context: RequestContext, organizationId: EntityId, siteId: EntityId) { return this.repository.listReplenishmentAlerts(context.tenantId, organizationId, siteId); }

  async scopeForPurchaseOrder(context: RequestContext, id: EntityId) { const value = await this.purchaseOrder(context.tenantId, id); return { organizationId: value.organizationId, siteId: value.siteId }; }
  private async position(tenantId: TenantId, siteId: EntityId, partId: EntityId, repository = this.repository): Promise<StockPositionProps> { return (await repository.findPosition(tenantId, siteId, partId)) ?? { tenantId, siteId, partId, onHand: 0, reserved: 0, averageUnitCostCents: 0, updatedAt: this.now().toISOString() }; }
  private async reservation(tenantId: TenantId, id: EntityId) { const value = await this.repository.findReservation(tenantId, id); invariant(value, "RESERVATION_NOT_FOUND", "Reservation was not found"); return value; }
  private async purchaseOrder(tenantId: TenantId, id: EntityId, repository = this.repository) { const value = await repository.findPurchaseOrder(tenantId, id); invariant(value, "PURCHASE_ORDER_NOT_FOUND", "Purchase order was not found"); return value; }
}
