import test from "node:test";
import assert from "node:assert/strict";
import { AuditRecorder, InMemoryAuditSink } from "../audit/src/audit.ts";
import { Membership } from "../organizations/src/access-control.ts";
import { tenantId, type EntityId } from "../core/src/identity.ts";
import { ManageVehicleCommerce } from "../vehicle-commerce/src/vehicle-commerce.ts";
import { InMemoryVehicleCommerceRepository } from "../vehicle-commerce/src/in-memory-vehicle-commerce-repository.ts";
import { PlatformApplication } from "../../apps/api/src/application.ts";
import { buildApp } from "../../apps/api/src/build-app.ts";
import {
  MapTokenVerifier,
  RequestContextResolver,
} from "../../apps/api/src/context-resolver.ts";
import { InMemoryPlatformRepository } from "../../apps/api/src/in-memory-platform-repository.ts";
import {
  InMemoryMembershipReader,
  RouteAuthorizer,
} from "../../apps/api/src/route-authorizer.ts";

test("publishes, sells, delivers and transfers a vehicle through scoped HTTP routes", async () => {
  const tenant = "11111111-1111-4111-8111-111111111111",
    actor = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    organizationId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as EntityId,
    siteId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc" as EntityId,
    assetId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd" as EntityId,
    buyerCustomerId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" as EntityId,
    sellerCustomerId = "ffffffff-ffff-4fff-8fff-ffffffffffff" as EntityId,
    documentId = "99999999-9999-4999-8999-999999999999" as EntityId;
  const contexts = new RequestContextResolver(
    new MapTokenVerifier(
      new Map([["commerce-token", { tenantId: tenant, actorId: actor }]]),
    ),
  );
  const membership = Membership.create({
    tenantId: tenantId(tenant),
    organizationId,
    userId: actor as EntityId,
    role: "owner",
    siteIds: [],
    extraPermissions: [],
  }).snapshot();
  const repository = new InMemoryVehicleCommerceRepository();
  repository.assets.add(`${tenant}:${assetId}`);
  repository.assetOwners.set(`${tenant}:${assetId}`, sellerCustomerId);
  repository.documents.add(`${tenant}:${assetId}:${documentId}`);
  repository.customers.add(`${tenant}:${buyerCustomerId}`);
  repository.customers.add(`${tenant}:${sellerCustomerId}`);
  repository.sites.set(`${tenant}:${siteId}`, organizationId);
  const commerce = new ManageVehicleCommerce(
    repository,
    () => new Date("2026-07-22T10:00:00Z"),
  );
  const app = buildApp({
    application: new PlatformApplication(
      new InMemoryPlatformRepository(),
      new AuditRecorder(new InMemoryAuditSink()),
    ),
    contexts,
    authorizer: new RouteAuthorizer(new InMemoryMembershipReader([membership])),
    modules: { vehicleCommerce: commerce },
  });
  const headers = { authorization: "Bearer commerce-token" };
  const acquired = await app.inject({
    method: "POST",
    url: "/v1/vehicle-stock",
    headers,
    payload: {
      organizationId,
      siteId,
      assetId,
      acquisitionMode: "trade_in",
      acquisitionCostCents: 1200000,
    },
  });
  assert.equal(acquired.statusCode, 200);
  const id = acquired.json().id;
  await app.inject({
    method: "POST",
    url: `/v1/vehicle-stock/${id}/start-preparation`,
    headers,
  });
  const check = await app.inject({
    method: "POST",
    url: `/v1/vehicle-stock/${id}/preparation-checks`,
    headers,
    payload: { label: "Contrôle sécurité", required: true },
  });
  await app.inject({
    method: "POST",
    url: `/v1/vehicle-stock/${id}/preparation-checks/${check.json().id}/complete`,
    headers,
  });
  await app.inject({
    method: "POST",
    url: `/v1/vehicle-stock/${id}/media`,
    headers,
    payload: {
      kind: "image",
      storageKey: `vehicles/${id}/cover.jpg`,
      position: 0,
      primary: true,
    },
  });
  await app.inject({
    method: "POST",
    url: `/v1/vehicle-stock/${id}/ready`,
    headers,
    payload: { askingPriceCents: 1590000 },
  });
  await app.inject({
    method: "POST",
    url: `/v1/vehicle-stock/${id}/publications`,
    headers,
    payload: { channel: "central_marketplace" },
  });
  const flash = await app.inject({
    method: "POST",
    url: `/v1/vehicle-stock/${id}/flash-sales`,
    headers,
    payload: {
      priceCents: 1490000,
      startsAt: "2026-07-22T11:00:00Z",
      endsAt: "2026-07-23T11:00:00Z",
      channels: ["central_marketplace"],
    },
  });
  assert.equal(flash.statusCode, 200);
  assert.equal(flash.json().priceCents, 1490000);
  const cancelFlash = await app.inject({
    method: "POST",
    url: `/v1/vehicle-stock/${id}/flash-sales/cancel`,
    headers,
  });
  assert.equal(cancelFlash.statusCode, 200);
  const auction = await app.inject({
    method: "POST",
    url: `/v1/vehicle-stock/${id}/auctions`,
    headers,
    payload: {
      channel: "central_marketplace",
      startingPriceCents: 1300000,
      reservePriceCents: 1450000,
      minimumIncrementCents: 10000,
      startsAt: "2026-07-22T10:00:00Z",
      endsAt: "2026-07-22T11:00:00Z",
    },
  });
  assert.equal(auction.statusCode, 200);
  const guarantee = await app.inject({
    method: "POST",
    url: `/v1/vehicle-stock/${id}/auctions/${auction.json().id}/guarantees`,
    headers,
    payload: {
      bidderCustomerId: buyerCustomerId,
      provider: "test_psp",
      providerReference: "route-auth-buyer",
      idempotencyKey: "route-guarantee-buyer",
      amountCents: auction.json().guaranteeAmountCents,
      currency: auction.json().currency,
    },
  });
  assert.equal(guarantee.statusCode, 200);
  const bid = await app.inject({
    method: "POST",
    url: `/v1/vehicle-stock/${id}/auctions/${auction.json().id}/bids`,
    headers,
    payload: { bidderCustomerId: buyerCustomerId, amountCents: 1450000 },
  });
  assert.equal(bid.statusCode, 200);
  const sale = await app.inject({
    method: "POST",
    url: `/v1/vehicle-stock/${id}/sale`,
    headers,
    payload: { buyerCustomerId, salePriceCents: 1500000 },
  });
  assert.equal(sale.statusCode, 200);
  assert.equal(sale.json().sale.grossMarginCents, 300000);
  assert.equal(repository.auctions[0]!.closedReason, "direct_sale");
  assert.equal(repository.auctionGuarantees[0]!.closedReason, "direct_sale");
  await app.inject({
    method: "POST",
    url: `/v1/vehicle-stock/${id}/delivery`,
    headers,
    payload: { plannedAt: "2026-07-24T09:00:00+02:00" },
  });
  await app.inject({
    method: "POST",
    url: `/v1/vehicle-stock/${id}/delivery/complete`,
    headers,
    payload: { handoverOdometerKm: 41200, notes: "Remis avec deux clés" },
  });
  const transfer = await app.inject({
    method: "POST",
    url: `/v1/vehicle-stock/${id}/ownership-transfer`,
    headers,
    payload: { documentIds: [documentId] },
  });
  assert.equal(transfer.statusCode, 200);
  assert.equal(transfer.json().newOwnerCustomerId, buyerCustomerId);
  await app.close();
});

test("issues a scoped cession dossier through HTTP", async () => {
  const tenant = "21111111-1111-4111-8111-111111111111",
    actor = "2aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as EntityId,
    organizationId = "2bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as EntityId,
    siteId = "2ccccccc-cccc-4ccc-8ccc-cccccccccccc" as EntityId,
    assetId = "2ddddddd-dddd-4ddd-8ddd-dddddddddddd" as EntityId,
    stockItemId = "2eeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" as EntityId,
    customerId = "2fffffff-ffff-4fff-8fff-ffffffffffff" as EntityId,
    certificateDocumentId = "27777777-7777-4777-8777-777777777777" as EntityId,
    deliveryReceiptDocumentId =
      "28888888-8888-4888-8888-888888888888" as EntityId,
    transferId = "29999999-9999-4999-8999-999999999999" as EntityId;
  const repository = new InMemoryVehicleCommerceRepository();
  repository.items.push({
    id: stockItemId,
    tenantId: tenantId(tenant),
    organizationId,
    siteId,
    assetId,
    acquisitionMode: "purchase",
    acquisitionCostCents: 1,
    status: "delivered",
    createdBy: actor,
    createdAt: "2026-07-22T10:00:00Z",
    updatedAt: "2026-07-22T10:00:00Z",
  });
  repository.transfers.push({
    id: transferId,
    tenantId: tenantId(tenant),
    organizationId,
    siteId,
    stockItemId,
    saleId: actor,
    deliveryId: actor,
    assetId,
    previousOwnerCustomerId: actor,
    newOwnerCustomerId: customerId,
    documentIds: [],
    evidenceHash: "a".repeat(64),
    transferredBy: actor,
    transferredAt: "2026-07-22T10:00:00Z",
  });
  const certificateKey = `${tenant}:${assetId}:${certificateDocumentId}`,
    receiptKey = `${tenant}:${assetId}:${deliveryReceiptDocumentId}`;
  repository.documentKinds.set(certificateKey, "cession_certificate");
  repository.documentKinds.set(receiptKey, "delivery_receipt");
  repository.documentOwners.set(certificateKey, customerId);
  repository.documentOwners.set(receiptKey, customerId);
  const membership = Membership.create({
      tenantId: tenantId(tenant),
      organizationId,
      userId: actor,
      role: "owner",
      siteIds: [],
      extraPermissions: [],
    }).snapshot(),
    contexts = new RequestContextResolver(
      new MapTokenVerifier(
        new Map([["cession-token", { tenantId: tenant, actorId: actor }]]),
      ),
    ),
    commerce = new ManageVehicleCommerce(
      repository,
      () => new Date("2026-07-22T10:00:00Z"),
    ),
    app = buildApp({
      application: new PlatformApplication(
        new InMemoryPlatformRepository(),
        new AuditRecorder(new InMemoryAuditSink()),
      ),
      contexts,
      authorizer: new RouteAuthorizer(
        new InMemoryMembershipReader([membership]),
      ),
      modules: { vehicleCommerce: commerce },
    });
  const response = await app.inject({
    method: "POST",
    url: `/v1/vehicle-stock/${stockItemId}/cession-dossier`,
    headers: { authorization: "Bearer cession-token" },
    payload: { certificateDocumentId, deliveryReceiptDocumentId },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().customerId, customerId);
  const duplicate = await app.inject({
    method: "POST",
    url: `/v1/vehicle-stock/${stockItemId}/cession-dossier`,
    headers: { authorization: "Bearer cession-token" },
    payload: { certificateDocumentId, deliveryReceiptDocumentId },
  });
  assert.equal(duplicate.statusCode, 422);
  assert.equal(duplicate.json().error, "CESSION_DOSSIER_ALREADY_ISSUED");
  await app.close();
});
