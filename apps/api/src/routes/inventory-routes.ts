import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { EntityId } from "../../../../packages/core/src/identity.ts";
import type { ManageInventory } from "../../../../packages/inventory/src/manage-inventory.ts";
import type { RequestContextResolver } from "../context-resolver.ts";
import type { RouteAuthorizer } from "../route-authorizer.ts";

const uuid = z.string().uuid();
const supplierBody = z.object({ organizationId: uuid, code: z.string().min(2), name: z.string().min(2), email: z.email().optional() });
const partBody = z.object({ organizationId: uuid, sku: z.string().min(2), name: z.string().min(2), unitCostCents: z.number().int().min(0), salePriceCents: z.number().int().min(0), reorderPoint: z.number().min(0), reorderQuantity: z.number().positive() });
const lineBody = z.object({ partId: uuid, quantity: z.number().positive(), unitCostCents: z.number().int().min(0) });
const purchaseOrderBody = z.object({ organizationId: uuid, siteId: uuid, supplierId: uuid, lines: z.array(lineBody).min(1) });
const receiptBody = z.object({ lines: z.array(lineBody).min(1) });
const idParams = z.object({ id: uuid });

export function registerInventoryRoutes(app: FastifyInstance, contexts: RequestContextResolver, authorizer: RouteAuthorizer, inventory: ManageInventory): void {
  app.post("/v1/suppliers", async request => { const context = await contexts.resolve(request); const body = supplierBody.parse(request.body); await authorizer.require(context, "parts.manage", { organizationId: body.organizationId as EntityId }); const input: { organizationId: EntityId; code: string; name: string; email?: string } = { organizationId: body.organizationId as EntityId, code: body.code, name: body.name }; if (body.email) input.email = body.email; return inventory.createSupplier(context, input); });
  app.post("/v1/parts", async request => { const context = await contexts.resolve(request); const body = partBody.parse(request.body); await authorizer.require(context, "parts.manage", { organizationId: body.organizationId as EntityId }); return inventory.createPart(context, { ...body, organizationId: body.organizationId as EntityId }); });
  app.post("/v1/purchase-orders", async request => { const context = await contexts.resolve(request); const body = purchaseOrderBody.parse(request.body); await authorizer.require(context, "parts.manage", { organizationId: body.organizationId as EntityId, siteId: body.siteId as EntityId }); return inventory.createPurchaseOrder(context, { organizationId: body.organizationId as EntityId, siteId: body.siteId as EntityId, supplierId: body.supplierId as EntityId, lines: body.lines as Array<{ partId: EntityId; quantity: number; unitCostCents: number }> }); });
  app.post("/v1/purchase-orders/:id/order", async request => { const context = await contexts.resolve(request); const params = idParams.parse(request.params); await authorizer.require(context, "parts.manage", await inventory.scopeForPurchaseOrder(context, params.id as EntityId)); return inventory.order(context, params.id as EntityId); });
  app.post("/v1/purchase-orders/:id/receipts", async request => { const context = await contexts.resolve(request); const params = idParams.parse(request.params); const body = receiptBody.parse(request.body); await authorizer.require(context, "parts.manage", await inventory.scopeForPurchaseOrder(context, params.id as EntityId)); return inventory.receivePurchaseOrder(context, params.id as EntityId, body.lines as Array<{ partId: EntityId; quantity: number; unitCostCents: number }>); });
}
