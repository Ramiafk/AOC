import type { Pool, PoolClient } from "pg";
import { DomainError } from "../../packages/core/src/errors.ts";
import type { EntityId, TenantId } from "../../packages/core/src/identity.ts";
import type {
  VehicleAuctionBidProps,
  VehicleAuctionGuaranteeProps,
  VehicleAuctionProps,
  VehicleCessionDossierProps,
  VehicleCommerceRepository,
  VehicleDeliveryProps,
  VehicleFlashSaleProps,
  VehicleMediaProps,
  VehicleOwnershipTransferProps,
  VehiclePreparationCheckProps,
  VehiclePublicationProps,
  VehicleSaleProps,
  VehicleStockItemProps,
} from "../../packages/vehicle-commerce/src/vehicle-commerce.ts";

function isCanonicalGuaranteeReplay(
  current: Readonly<VehicleAuctionGuaranteeProps>,
  requested: Readonly<VehicleAuctionGuaranteeProps>,
): boolean {
  return (
    current.organizationId === requested.organizationId &&
    current.siteId === requested.siteId &&
    current.stockItemId === requested.stockItemId &&
    current.auctionId === requested.auctionId &&
    current.bidderCustomerId === requested.bidderCustomerId &&
    current.provider === requested.provider &&
    current.providerReference === requested.providerReference &&
    current.amountCents === requested.amountCents &&
    current.currency === requested.currency
  );
}

export class PostgresVehicleCommerceRepository
  implements VehicleCommerceRepository
{
  private readonly pool: Pool;
  private readonly transaction: PoolClient | undefined;
  constructor(pool: Pool, transaction: PoolClient | undefined = undefined) {
    this.pool = pool;
    this.transaction = transaction;
  }
  private async tx<T>(
    tenantId: TenantId,
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    if (this.transaction) return operation(this.transaction);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [
        tenantId,
      ]);
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async assetExists(tenantId: TenantId, assetId: EntityId) {
    return this.tx(
      tenantId,
      async (client) =>
        (
          await client.query(
            "SELECT 1 FROM assets WHERE tenant_id=$1 AND id=$2",
            [tenantId, assetId],
          )
        ).rowCount === 1,
    );
  }
  async siteBelongsToOrganization(
    tenantId: TenantId,
    organizationId: EntityId,
    siteId: EntityId,
  ) {
    return this.tx(
      tenantId,
      async (client) =>
        (
          await client.query(
            "SELECT 1 FROM sites WHERE tenant_id=$1 AND organization_id=$2 AND id=$3",
            [tenantId, organizationId, siteId],
          )
        ).rowCount === 1,
    );
  }
  async customerExists(tenantId: TenantId, customerId: EntityId) {
    return this.tx(
      tenantId,
      async (client) =>
        (
          await client.query(
            "SELECT 1 FROM customers WHERE tenant_id=$1 AND id=$2",
            [tenantId, customerId],
          )
        ).rowCount === 1,
    );
  }
  async findSale(tenantId: TenantId, stockItemId: EntityId) {
    return this.tx(tenantId, async (client) => {
      const result = await client.query(
        `SELECT id,tenant_id AS "tenantId",organization_id AS "organizationId",site_id AS "siteId",stock_item_id AS "stockItemId",buyer_customer_id AS "buyerCustomerId",sale_price_cents AS "salePriceCents",acquisition_cost_cents AS "acquisitionCostCents",gross_margin_cents AS "grossMarginCents",sold_by AS "soldBy",sold_at AS "soldAt" FROM vehicle_sales WHERE tenant_id=$1 AND stock_item_id=$2`,
        [tenantId, stockItemId],
      );
      return (result.rows[0] as VehicleSaleProps | undefined) ?? null;
    });
  }
  async findDelivery(tenantId: TenantId, stockItemId: EntityId) {
    return this.tx(tenantId, async (client) => {
      const result = await client.query(
        `SELECT id,tenant_id AS "tenantId",organization_id AS "organizationId",site_id AS "siteId",stock_item_id AS "stockItemId",sale_id AS "saleId",status,planned_at AS "plannedAt",handover_odometer_km AS "handoverOdometerKm",notes,scheduled_by AS "scheduledBy",completed_by AS "completedBy",completed_at AS "completedAt",created_at AS "createdAt" FROM vehicle_deliveries WHERE tenant_id=$1 AND stock_item_id=$2`,
        [tenantId, stockItemId],
      );
      return (result.rows[0] as VehicleDeliveryProps | undefined) ?? null;
    });
  }
  async assetOwnerCustomerId(tenantId: TenantId, assetId: EntityId) {
    return this.tx(tenantId, async (client) => {
      const result = await client.query(
        "SELECT owner_customer_id FROM assets WHERE tenant_id=$1 AND id=$2",
        [tenantId, assetId],
      );
      return (
        (result.rows[0]?.owner_customer_id as EntityId | undefined) ?? null
      );
    });
  }
  async documentsBelongToAsset(
    tenantId: TenantId,
    assetId: EntityId,
    documentIds: readonly EntityId[],
  ) {
    return this.tx(tenantId, async (client) => {
      const result = await client.query(
        "SELECT count(*)::int AS count FROM documents WHERE tenant_id=$1 AND asset_id=$2 AND id=ANY($3::uuid[])",
        [tenantId, assetId, documentIds],
      );
      return result.rows[0].count === documentIds.length;
    });
  }
  async documentsMatchKinds(
    tenantId: TenantId,
    assetId: EntityId,
    ownerCustomerId: EntityId,
    documents: Readonly<Record<EntityId, string>>,
  ) {
    return this.tx(tenantId, async (client) => {
      const entries = Object.entries(documents),
        result = await client.query(
          "SELECT id,kind FROM documents WHERE tenant_id=$1 AND asset_id=$2 AND owner_customer_id=$3 AND id=ANY($4::uuid[])",
          [tenantId, assetId, ownerCustomerId, entries.map(([id]) => id)],
        );
      const actual = new Map(
        result.rows.map((row) => [row.id as string, row.kind as string]),
      );
      return entries.every(([id, kind]) => actual.get(id) === kind);
    });
  }
  async findOwnershipTransfer(tenantId: TenantId, stockItemId: EntityId) {
    return this.tx(tenantId, async (client) => {
      const result = await client.query(
        `SELECT id,tenant_id AS "tenantId",organization_id AS "organizationId",site_id AS "siteId",stock_item_id AS "stockItemId",sale_id AS "saleId",delivery_id AS "deliveryId",asset_id AS "assetId",previous_owner_customer_id AS "previousOwnerCustomerId",new_owner_customer_id AS "newOwnerCustomerId",evidence_hash AS "evidenceHash",transferred_by AS "transferredBy",transferred_at AS "transferredAt",ARRAY(SELECT document_id FROM vehicle_transfer_documents d WHERE d.tenant_id=vehicle_ownership_transfers.tenant_id AND d.transfer_id=vehicle_ownership_transfers.id) AS "documentIds" FROM vehicle_ownership_transfers WHERE tenant_id=$1 AND stock_item_id=$2`,
        [tenantId, stockItemId],
      );
      return (
        (result.rows[0] as VehicleOwnershipTransferProps | undefined) ?? null
      );
    });
  }
  async findCessionDossier(tenantId: TenantId, stockItemId: EntityId) {
    return this.tx(tenantId, async (client) => {
      const result = await client.query(
        `SELECT id,tenant_id AS "tenantId",organization_id AS "organizationId",site_id AS "siteId",stock_item_id AS "stockItemId",transfer_id AS "transferId",asset_id AS "assetId",customer_id AS "customerId",certificate_document_id AS "certificateDocumentId",delivery_receipt_document_id AS "deliveryReceiptDocumentId",issued_by AS "issuedBy",issued_at AS "issuedAt" FROM vehicle_cession_dossiers WHERE tenant_id=$1 AND stock_item_id=$2`,
        [tenantId, stockItemId],
      );
      return (result.rows[0] as VehicleCessionDossierProps | undefined) ?? null;
    });
  }
  async findOpenFlashSale(
    tenantId: TenantId,
    stockItemId: EntityId,
    at: string,
  ) {
    return this.tx(tenantId, async (client) => {
      const result = await client.query(
        `SELECT id,tenant_id AS "tenantId",organization_id AS "organizationId",site_id AS "siteId",stock_item_id AS "stockItemId",price_cents AS "priceCents",starts_at AS "startsAt",ends_at AS "endsAt",channels,status,created_by AS "createdBy",created_at AS "createdAt",closed_reason AS "closedReason",closed_by AS "closedBy",closed_at AS "closedAt" FROM vehicle_flash_sales WHERE tenant_id=$1 AND stock_item_id=$2 AND status='scheduled' AND ends_at>$3`,
        [tenantId, stockItemId, at],
      );
      return (result.rows[0] as VehicleFlashSaleProps | undefined) ?? null;
    });
  }
  async findLatestFlashSale(tenantId: TenantId, stockItemId: EntityId) {
    return this.tx(tenantId, async (client) => {
      const result = await client.query(
        `SELECT id,tenant_id AS "tenantId",organization_id AS "organizationId",site_id AS "siteId",stock_item_id AS "stockItemId",price_cents AS "priceCents",starts_at AS "startsAt",ends_at AS "endsAt",channels,status,created_by AS "createdBy",created_at AS "createdAt",closed_reason AS "closedReason",closed_by AS "closedBy",closed_at AS "closedAt" FROM vehicle_flash_sales WHERE tenant_id=$1 AND stock_item_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1`,
        [tenantId, stockItemId],
      );
      return (result.rows[0] as VehicleFlashSaleProps | undefined) ?? null;
    });
  }
  async expireFlashSales(
    tenantId: TenantId,
    stockItemId: EntityId,
    at: string,
  ) {
    await this.tx(tenantId, async (client) => {
      const expired = await client.query(
        `UPDATE vehicle_flash_sales SET status='expired',closed_reason='expired',closed_at=$3 WHERE tenant_id=$1 AND stock_item_id=$2 AND status='scheduled' AND ends_at<=$3 RETURNING id,organization_id,site_id`,
        [tenantId, stockItemId, at],
      );
      for (const row of expired.rows)
        await client.query(
          `INSERT INTO outbox_events(id,tenant_id,aggregate_id,event_type,payload,occurred_at) VALUES(gen_random_uuid(),$1,$2,'commerce.vehicle_flash_sale_expired.v1',$3,$4)`,
          [
            tenantId,
            row.id,
            JSON.stringify({
              organizationId: row.organization_id,
              siteId: row.site_id,
              stockItemId,
            }),
            at,
          ],
        );
    });
  }
  async findOpenAuction(tenantId: TenantId, stockItemId: EntityId) {
    return this.tx(tenantId, async (client) => {
      const result = await client.query(
        `SELECT id,tenant_id AS "tenantId",organization_id AS "organizationId",site_id AS "siteId",stock_item_id AS "stockItemId",channel,starting_price_cents AS "startingPriceCents",reserve_price_cents AS "reservePriceCents",minimum_increment_cents AS "minimumIncrementCents",guarantee_amount_cents AS "guaranteeAmountCents",currency,guarantee_required AS "guaranteeRequired",starts_at AS "startsAt",ends_at AS "endsAt",status,created_by AS "createdBy",created_at AS "createdAt",winner_customer_id AS "winnerCustomerId",winning_bid_id AS "winningBidId",closed_reason AS "closedReason",closed_by AS "closedBy",closed_at AS "closedAt" FROM vehicle_auctions WHERE tenant_id=$1 AND stock_item_id=$2 AND status='scheduled'`,
        [tenantId, stockItemId],
      );
      return (result.rows[0] as VehicleAuctionProps | undefined) ?? null;
    });
  }
  async listAuctionBids(tenantId: TenantId, auctionId: EntityId) {
    return this.tx(
      tenantId,
      async (client) =>
        (
          await client.query(
            `SELECT id,tenant_id AS "tenantId",organization_id AS "organizationId",site_id AS "siteId",auction_id AS "auctionId",stock_item_id AS "stockItemId",bidder_customer_id AS "bidderCustomerId",guarantee_id AS "guaranteeId",amount_cents AS "amountCents",placed_at AS "placedAt" FROM vehicle_auction_bids WHERE tenant_id=$1 AND auction_id=$2 ORDER BY amount_cents DESC,placed_at,id`,
            [tenantId, auctionId],
          )
        ).rows as VehicleAuctionBidProps[],
    );
  }
  async findAuctionGuarantee(
    tenantId: TenantId,
    auctionId: EntityId,
    bidderCustomerId: EntityId,
  ) {
    return this.tx(tenantId, async (client) => {
      const result = await client.query(
        `SELECT id,tenant_id AS "tenantId",organization_id AS "organizationId",site_id AS "siteId",auction_id AS "auctionId",stock_item_id AS "stockItemId",bidder_customer_id AS "bidderCustomerId",provider,provider_reference AS "providerReference",idempotency_key AS "idempotencyKey",amount_cents AS "amountCents",currency,status,authorized_at AS "authorizedAt",closed_at AS "closedAt",closed_reason AS "closedReason" FROM vehicle_auction_guarantees WHERE tenant_id=$1 AND auction_id=$2 AND bidder_customer_id=$3 AND status='authorized'`,
        [tenantId, auctionId, bidderCustomerId],
      );
      return (
        (result.rows[0] as VehicleAuctionGuaranteeProps | undefined) ?? null
      );
    });
  }
  async saveStockItem(value: Readonly<VehicleStockItemProps>) {
    await this.tx(value.tenantId, (client) =>
      client
        .query(
          `INSERT INTO vehicle_stock_items(id,tenant_id,organization_id,site_id,asset_id,acquisition_mode,acquisition_cost_cents,asking_price_cents,status,created_by,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(id) DO UPDATE SET asking_price_cents=EXCLUDED.asking_price_cents,status=EXCLUDED.status,updated_at=EXCLUDED.updated_at`,
          [
            value.id,
            value.tenantId,
            value.organizationId,
            value.siteId,
            value.assetId,
            value.acquisitionMode,
            value.acquisitionCostCents,
            value.askingPriceCents ?? null,
            value.status,
            value.createdBy,
            value.createdAt,
            value.updatedAt,
          ],
        )
        .then(() => undefined),
    );
  }
  async findStockItem(tenantId: TenantId, id: EntityId) {
    return this.tx(tenantId, async (client) => {
      const result = await client.query(
        `SELECT id,tenant_id AS "tenantId",organization_id AS "organizationId",site_id AS "siteId",asset_id AS "assetId",acquisition_mode AS "acquisitionMode",acquisition_cost_cents AS "acquisitionCostCents",asking_price_cents AS "askingPriceCents",status,created_by AS "createdBy",created_at AS "createdAt",updated_at AS "updatedAt" FROM vehicle_stock_items WHERE tenant_id=$1 AND id=$2`,
        [tenantId, id],
      );
      return (result.rows[0] as VehicleStockItemProps | undefined) ?? null;
    });
  }
  async listPublications(tenantId: TenantId, stockItemId: EntityId) {
    return this.tx(
      tenantId,
      async (client) =>
        (
          await client.query(
            `SELECT id,tenant_id AS "tenantId",organization_id AS "organizationId",site_id AS "siteId",stock_item_id AS "stockItemId",channel,asking_price_cents AS "askingPriceCents",status,published_by AS "publishedBy",published_at AS "publishedAt" FROM vehicle_publications WHERE tenant_id=$1 AND stock_item_id=$2`,
            [tenantId, stockItemId],
          )
        ).rows as VehiclePublicationProps[],
    );
  }
  async savePreparationCheck(value: Readonly<VehiclePreparationCheckProps>) {
    await this.tx(value.tenantId, (client) =>
      client
        .query(
          `INSERT INTO vehicle_preparation_checks(id,tenant_id,organization_id,site_id,stock_item_id,label,required,completed_by,completed_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO UPDATE SET completed_by=EXCLUDED.completed_by,completed_at=EXCLUDED.completed_at`,
          [
            value.id,
            value.tenantId,
            value.organizationId,
            value.siteId,
            value.stockItemId,
            value.label,
            value.required,
            value.completedBy ?? null,
            value.completedAt ?? null,
            value.createdAt,
          ],
        )
        .then(() => undefined),
    );
  }
  async listPreparationChecks(tenantId: TenantId, stockItemId: EntityId) {
    return this.tx(
      tenantId,
      async (client) =>
        (
          await client.query(
            `SELECT id,tenant_id AS "tenantId",organization_id AS "organizationId",site_id AS "siteId",stock_item_id AS "stockItemId",label,required,completed_by AS "completedBy",completed_at AS "completedAt",created_at AS "createdAt" FROM vehicle_preparation_checks WHERE tenant_id=$1 AND stock_item_id=$2 ORDER BY created_at`,
            [tenantId, stockItemId],
          )
        ).rows as VehiclePreparationCheckProps[],
    );
  }
  async saveMedia(value: Readonly<VehicleMediaProps>) {
    await this.tx(value.tenantId, (client) =>
      client
        .query(
          `INSERT INTO vehicle_media(id,tenant_id,organization_id,site_id,stock_item_id,kind,storage_key,position,is_primary,created_by,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            value.id,
            value.tenantId,
            value.organizationId,
            value.siteId,
            value.stockItemId,
            value.kind,
            value.storageKey,
            value.position,
            value.primary,
            value.createdBy,
            value.createdAt,
          ],
        )
        .then(() => undefined),
    );
  }
  async listMedia(tenantId: TenantId, stockItemId: EntityId) {
    return this.tx(
      tenantId,
      async (client) =>
        (
          await client.query(
            `SELECT id,tenant_id AS "tenantId",organization_id AS "organizationId",site_id AS "siteId",stock_item_id AS "stockItemId",kind,storage_key AS "storageKey",position,is_primary AS primary,created_by AS "createdBy",created_at AS "createdAt" FROM vehicle_media WHERE tenant_id=$1 AND stock_item_id=$2 ORDER BY position`,
            [tenantId, stockItemId],
          )
        ).rows as VehicleMediaProps[],
    );
  }
  async withStockItemLock<T>(
    tenantId: TenantId,
    id: EntityId,
    operation: (repository: VehicleCommerceRepository) => Promise<T>,
  ): Promise<T> {
    return this.tx(tenantId, async (client) => {
      await client.query(
        "SELECT id FROM vehicle_stock_items WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
        [tenantId, id],
      );
      return operation(
        new PostgresVehicleCommerceRepository(this.pool, client),
      );
    });
  }
  async publish(
    value: Readonly<VehiclePublicationProps>,
    stockItem: Readonly<VehicleStockItemProps>,
  ) {
    await this.tx(value.tenantId, async (client) => {
      await client.query(
        `INSERT INTO vehicle_publications(id,tenant_id,organization_id,site_id,stock_item_id,channel,asking_price_cents,status,published_by,published_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          value.id,
          value.tenantId,
          value.organizationId,
          value.siteId,
          value.stockItemId,
          value.channel,
          value.askingPriceCents,
          value.status,
          value.publishedBy,
          value.publishedAt,
        ],
      );
      await client.query(
        "UPDATE vehicle_stock_items SET status=$3,updated_at=$4 WHERE tenant_id=$1 AND id=$2",
        [
          stockItem.tenantId,
          stockItem.id,
          stockItem.status,
          stockItem.updatedAt,
        ],
      );
      await client.query(
        `INSERT INTO outbox_events(id,tenant_id,aggregate_id,event_type,payload,occurred_at) VALUES(gen_random_uuid(),$1,$2,'commerce.vehicle_published.v1',$3,$4)`,
        [
          value.tenantId,
          value.id,
          JSON.stringify({
            organizationId: value.organizationId,
            siteId: value.siteId,
            stockItemId: value.stockItemId,
            channel: value.channel,
          }),
          value.publishedAt,
        ],
      );
    });
  }
  async markReady(
    stockItem: Readonly<VehicleStockItemProps>,
    readyBy: EntityId,
  ) {
    await this.tx(stockItem.tenantId, async (client) => {
      await client.query(
        "UPDATE vehicle_stock_items SET asking_price_cents=$3,status='ready',updated_at=$4 WHERE tenant_id=$1 AND id=$2",
        [
          stockItem.tenantId,
          stockItem.id,
          stockItem.askingPriceCents,
          stockItem.updatedAt,
        ],
      );
      await client.query(
        `INSERT INTO outbox_events(id,tenant_id,aggregate_id,event_type,payload,occurred_at) VALUES(gen_random_uuid(),$1,$2,'commerce.vehicle_ready.v1',$3,$4)`,
        [
          stockItem.tenantId,
          stockItem.id,
          JSON.stringify({
            organizationId: stockItem.organizationId,
            siteId: stockItem.siteId,
            readyBy,
          }),
          stockItem.updatedAt,
        ],
      );
    });
  }
  async sell(
    value: Readonly<VehicleSaleProps>,
    stockItem: Readonly<VehicleStockItemProps>,
  ) {
    await this.tx(value.tenantId, async (client) => {
      await client.query(
        `INSERT INTO vehicle_sales(id,tenant_id,organization_id,site_id,stock_item_id,buyer_customer_id,sale_price_cents,acquisition_cost_cents,gross_margin_cents,sold_by,sold_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          value.id,
          value.tenantId,
          value.organizationId,
          value.siteId,
          value.stockItemId,
          value.buyerCustomerId,
          value.salePriceCents,
          value.acquisitionCostCents,
          value.grossMarginCents,
          value.soldBy,
          value.soldAt,
        ],
      );
      await client.query(
        "UPDATE vehicle_stock_items SET status='sold',updated_at=$3 WHERE tenant_id=$1 AND id=$2",
        [stockItem.tenantId, stockItem.id, stockItem.updatedAt],
      );
      await client.query(
        "UPDATE vehicle_publications SET status='withdrawn' WHERE tenant_id=$1 AND stock_item_id=$2 AND status='published'",
        [stockItem.tenantId, stockItem.id],
      );
      await client.query(
        "UPDATE vehicle_flash_sales SET status='closed',closed_reason='sold',closed_by=$3,closed_at=$4 WHERE tenant_id=$1 AND stock_item_id=$2 AND status='scheduled'",
        [value.tenantId, value.stockItemId, value.soldBy, value.soldAt],
      );
      await client.query(
        "UPDATE vehicle_auctions SET status='cancelled',closed_reason='direct_sale',closed_by=$3,closed_at=$4 WHERE tenant_id=$1 AND stock_item_id=$2 AND status='scheduled'",
        [value.tenantId, value.stockItemId, value.soldBy, value.soldAt],
      );
      const released = await client.query(
        "UPDATE vehicle_auction_guarantees SET status='released',closed_reason='direct_sale',closed_at=$3 WHERE tenant_id=$1 AND stock_item_id=$2 AND status='authorized' RETURNING id,auction_id,bidder_customer_id,amount_cents,currency",
        [value.tenantId, value.stockItemId, value.soldAt],
      );
      for (const row of released.rows)
        await client.query(
          `INSERT INTO outbox_events(id,tenant_id,aggregate_id,event_type,payload,occurred_at) VALUES(gen_random_uuid(),$1,$2,'commerce.vehicle_auction_guarantee_released.v1',$3,$4)`,
          [
            value.tenantId,
            row.id,
            JSON.stringify({
              organizationId: value.organizationId,
              siteId: value.siteId,
              stockItemId: value.stockItemId,
              auctionId: row.auction_id,
              bidderCustomerId: row.bidder_customer_id,
              amountCents: row.amount_cents,
              currency: row.currency,
              reason: "direct_sale",
            }),
            value.soldAt,
          ],
        );
      await client.query(
        `INSERT INTO outbox_events(id,tenant_id,aggregate_id,event_type,payload,occurred_at) VALUES(gen_random_uuid(),$1,$2,'commerce.vehicle_sold.v1',$3,$4)`,
        [
          value.tenantId,
          value.id,
          JSON.stringify({
            organizationId: value.organizationId,
            siteId: value.siteId,
            stockItemId: value.stockItemId,
            buyerCustomerId: value.buyerCustomerId,
            salePriceCents: value.salePriceCents,
            grossMarginCents: value.grossMarginCents,
          }),
          value.soldAt,
        ],
      );
    });
  }
  async saveDelivery(value: Readonly<VehicleDeliveryProps>) {
    await this.tx(value.tenantId, async (client) => {
      await client.query(
        `INSERT INTO vehicle_deliveries(id,tenant_id,organization_id,site_id,stock_item_id,sale_id,status,planned_at,scheduled_by,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          value.id,
          value.tenantId,
          value.organizationId,
          value.siteId,
          value.stockItemId,
          value.saleId,
          value.status,
          value.plannedAt,
          value.scheduledBy,
          value.createdAt,
        ],
      );
      await client.query(
        `INSERT INTO outbox_events(id,tenant_id,aggregate_id,event_type,payload,occurred_at) VALUES(gen_random_uuid(),$1,$2,'commerce.vehicle_delivery_scheduled.v1',$3,$4)`,
        [
          value.tenantId,
          value.id,
          JSON.stringify({
            organizationId: value.organizationId,
            siteId: value.siteId,
            stockItemId: value.stockItemId,
            saleId: value.saleId,
            plannedAt: value.plannedAt,
          }),
          value.createdAt,
        ],
      );
    });
  }
  async completeDelivery(
    value: Readonly<VehicleDeliveryProps>,
    stockItem: Readonly<VehicleStockItemProps>,
  ) {
    await this.tx(value.tenantId, async (client) => {
      await client.query(
        `UPDATE vehicle_deliveries SET status='completed',handover_odometer_km=$3,notes=$4,completed_by=$5,completed_at=$6 WHERE tenant_id=$1 AND id=$2 AND status='scheduled'`,
        [
          value.tenantId,
          value.id,
          value.handoverOdometerKm,
          value.notes ?? null,
          value.completedBy,
          value.completedAt,
        ],
      );
      await client.query(
        "UPDATE vehicle_stock_items SET status='delivered',updated_at=$3 WHERE tenant_id=$1 AND id=$2",
        [stockItem.tenantId, stockItem.id, stockItem.updatedAt],
      );
      await client.query(
        `INSERT INTO outbox_events(id,tenant_id,aggregate_id,event_type,payload,occurred_at) VALUES(gen_random_uuid(),$1,$2,'commerce.vehicle_delivered.v1',$3,$4)`,
        [
          value.tenantId,
          value.id,
          JSON.stringify({
            organizationId: value.organizationId,
            siteId: value.siteId,
            stockItemId: value.stockItemId,
            saleId: value.saleId,
            handoverOdometerKm: value.handoverOdometerKm,
          }),
          value.completedAt,
        ],
      );
    });
  }
  async transferOwnership(value: Readonly<VehicleOwnershipTransferProps>) {
    await this.tx(value.tenantId, async (client) => {
      const passport = await client.query(
        "SELECT id FROM passports WHERE tenant_id=$1 AND asset_id=$2 FOR UPDATE",
        [value.tenantId, value.assetId],
      );
      const passportId = passport.rows[0]?.id as EntityId | undefined;
      if (!passportId)
        throw new DomainError("PASSPORT_NOT_FOUND", "Passport was not found");
      await client.query(
        `INSERT INTO vehicle_ownership_transfers(id,tenant_id,organization_id,site_id,stock_item_id,sale_id,delivery_id,asset_id,previous_owner_customer_id,new_owner_customer_id,evidence_hash,transferred_by,transferred_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          value.id,
          value.tenantId,
          value.organizationId,
          value.siteId,
          value.stockItemId,
          value.saleId,
          value.deliveryId,
          value.assetId,
          value.previousOwnerCustomerId,
          value.newOwnerCustomerId,
          value.evidenceHash,
          value.transferredBy,
          value.transferredAt,
        ],
      );
      for (const documentId of value.documentIds)
        await client.query(
          "INSERT INTO vehicle_transfer_documents(tenant_id,transfer_id,document_id) VALUES($1,$2,$3)",
          [value.tenantId, value.id, documentId],
        );
      const assetUpdate = await client.query(
        "UPDATE assets SET owner_customer_id=$3 WHERE tenant_id=$1 AND id=$2 AND owner_customer_id=$4",
        [
          value.tenantId,
          value.assetId,
          value.newOwnerCustomerId,
          value.previousOwnerCustomerId,
        ],
      );
      const passportUpdate = await client.query(
        "UPDATE passports SET owner_customer_id=$3 WHERE tenant_id=$1 AND id=$2 AND owner_customer_id=$4",
        [
          value.tenantId,
          passportId,
          value.newOwnerCustomerId,
          value.previousOwnerCustomerId,
        ],
      );
      if (assetUpdate.rowCount !== 1 || passportUpdate.rowCount !== 1)
        throw new DomainError(
          "OWNERSHIP_CONFLICT",
          "Asset ownership changed concurrently",
        );
      await client.query(
        `INSERT INTO passport_entries(id,tenant_id,passport_id,asset_id,type,title,occurred_at,mileage,provider_organization_id,document_ids,visibility,evidence_hash,created_by,created_at) VALUES(gen_random_uuid(),$1,$2,$3,'ownership','Transfert de propriété',$4,NULL,$5,$6,'owner_only',$7,$8,$4)`,
        [
          value.tenantId,
          passportId,
          value.assetId,
          value.transferredAt,
          value.organizationId,
          value.documentIds,
          value.evidenceHash,
          value.transferredBy,
        ],
      );
      await client.query(
        `INSERT INTO outbox_events(id,tenant_id,aggregate_id,event_type,payload,occurred_at) VALUES(gen_random_uuid(),$1,$2,'commerce.vehicle_ownership_transferred.v1',$3,$4)`,
        [
          value.tenantId,
          value.id,
          JSON.stringify({
            organizationId: value.organizationId,
            siteId: value.siteId,
            stockItemId: value.stockItemId,
            assetId: value.assetId,
            previousOwnerCustomerId: value.previousOwnerCustomerId,
            newOwnerCustomerId: value.newOwnerCustomerId,
            documentIds: value.documentIds,
          }),
          value.transferredAt,
        ],
      );
    });
  }
  async issueCessionDossier(value: Readonly<VehicleCessionDossierProps>) {
    try {
      await this.tx(value.tenantId, async (client) => {
        await client.query(
          `INSERT INTO vehicle_cession_dossiers(id,tenant_id,organization_id,site_id,stock_item_id,transfer_id,asset_id,customer_id,certificate_document_id,delivery_receipt_document_id,issued_by,issued_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            value.id,
            value.tenantId,
            value.organizationId,
            value.siteId,
            value.stockItemId,
            value.transferId,
            value.assetId,
            value.customerId,
            value.certificateDocumentId,
            value.deliveryReceiptDocumentId,
            value.issuedBy,
            value.issuedAt,
          ],
        );
        await client.query(
          `INSERT INTO outbox_events(id,tenant_id,aggregate_id,event_type,payload,occurred_at) VALUES(gen_random_uuid(),$1,$2,'commerce.vehicle_cession_dossier_issued.v1',$3,$4)`,
          [
            value.tenantId,
            value.id,
            JSON.stringify({
              organizationId: value.organizationId,
              siteId: value.siteId,
              stockItemId: value.stockItemId,
              assetId: value.assetId,
              customerId: value.customerId,
              documentIds: [
                value.certificateDocumentId,
                value.deliveryReceiptDocumentId,
              ],
              notificationTopic: "document",
            }),
            value.issuedAt,
          ],
        );
      });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "23505")
        throw new DomainError(
          "CESSION_DOSSIER_ALREADY_ISSUED",
          "Cession dossier is already issued",
        );
      throw error;
    }
  }
  async scheduleFlashSale(value: Readonly<VehicleFlashSaleProps>) {
    try {
      await this.tx(value.tenantId, async (client) => {
        await client.query(
          `INSERT INTO vehicle_flash_sales(id,tenant_id,organization_id,site_id,stock_item_id,price_cents,starts_at,ends_at,channels,status,created_by,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'scheduled',$10,$11)`,
          [
            value.id,
            value.tenantId,
            value.organizationId,
            value.siteId,
            value.stockItemId,
            value.priceCents,
            value.startsAt,
            value.endsAt,
            value.channels,
            value.createdBy,
            value.createdAt,
          ],
        );
        await client.query(
          `INSERT INTO outbox_events(id,tenant_id,aggregate_id,event_type,payload,occurred_at) VALUES(gen_random_uuid(),$1,$2,'commerce.vehicle_flash_sale_scheduled.v1',$3,$4)`,
          [
            value.tenantId,
            value.id,
            JSON.stringify({
              organizationId: value.organizationId,
              siteId: value.siteId,
              stockItemId: value.stockItemId,
              priceCents: value.priceCents,
              startsAt: value.startsAt,
              endsAt: value.endsAt,
              channels: value.channels,
            }),
            value.createdAt,
          ],
        );
      });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "23505")
        throw new DomainError(
          "FLASH_SALE_ALREADY_OPEN",
          "An open flash sale already exists for this vehicle",
        );
      throw error;
    }
  }
  async cancelFlashSale(value: Readonly<VehicleFlashSaleProps>) {
    await this.tx(value.tenantId, async (client) => {
      const updated = await client.query(
        "UPDATE vehicle_flash_sales SET status='cancelled',closed_reason='cancelled',closed_by=$3,closed_at=$4 WHERE tenant_id=$1 AND id=$2 AND status='scheduled'",
        [value.tenantId, value.id, value.closedBy, value.closedAt],
      );
      if (updated.rowCount !== 1)
        throw new DomainError(
          "FLASH_SALE_NOT_OPEN",
          "No open flash sale exists for this vehicle",
        );
      await client.query(
        `INSERT INTO outbox_events(id,tenant_id,aggregate_id,event_type,payload,occurred_at) VALUES(gen_random_uuid(),$1,$2,'commerce.vehicle_flash_sale_cancelled.v1',$3,$4)`,
        [
          value.tenantId,
          value.id,
          JSON.stringify({
            organizationId: value.organizationId,
            siteId: value.siteId,
            stockItemId: value.stockItemId,
          }),
          value.closedAt,
        ],
      );
    });
  }
  async withdrawStock(
    stockItem: Readonly<VehicleStockItemProps>,
    withdrawnBy: EntityId,
  ) {
    await this.tx(stockItem.tenantId, async (client) => {
      await client.query(
        "UPDATE vehicle_stock_items SET status='withdrawn',updated_at=$3 WHERE tenant_id=$1 AND id=$2",
        [stockItem.tenantId, stockItem.id, stockItem.updatedAt],
      );
      await client.query(
        "UPDATE vehicle_publications SET status='withdrawn' WHERE tenant_id=$1 AND stock_item_id=$2 AND status='published'",
        [stockItem.tenantId, stockItem.id],
      );
      await client.query(
        "UPDATE vehicle_flash_sales SET status='closed',closed_reason='withdrawn',closed_by=$3,closed_at=$4 WHERE tenant_id=$1 AND stock_item_id=$2 AND status='scheduled'",
        [stockItem.tenantId, stockItem.id, withdrawnBy, stockItem.updatedAt],
      );
      await client.query(
        "UPDATE vehicle_auctions SET status='cancelled',closed_reason='withdrawn',closed_by=$3,closed_at=$4 WHERE tenant_id=$1 AND stock_item_id=$2 AND status='scheduled'",
        [stockItem.tenantId, stockItem.id, withdrawnBy, stockItem.updatedAt],
      );
      const released = await client.query(
        "UPDATE vehicle_auction_guarantees SET status='released',closed_reason='withdrawn',closed_at=$3 WHERE tenant_id=$1 AND stock_item_id=$2 AND status='authorized' RETURNING id,auction_id,bidder_customer_id,amount_cents,currency",
        [stockItem.tenantId, stockItem.id, stockItem.updatedAt],
      );
      for (const row of released.rows)
        await client.query(
          `INSERT INTO outbox_events(id,tenant_id,aggregate_id,event_type,payload,occurred_at) VALUES(gen_random_uuid(),$1,$2,'commerce.vehicle_auction_guarantee_released.v1',$3,$4)`,
          [
            stockItem.tenantId,
            row.id,
            JSON.stringify({
              organizationId: stockItem.organizationId,
              siteId: stockItem.siteId,
              stockItemId: stockItem.id,
              auctionId: row.auction_id,
              bidderCustomerId: row.bidder_customer_id,
              amountCents: row.amount_cents,
              currency: row.currency,
              reason: "withdrawn",
            }),
            stockItem.updatedAt,
          ],
        );
      await client.query(
        `INSERT INTO outbox_events(id,tenant_id,aggregate_id,event_type,payload,occurred_at) VALUES(gen_random_uuid(),$1,$2,'commerce.vehicle_withdrawn.v1',$3,$4)`,
        [
          stockItem.tenantId,
          stockItem.id,
          JSON.stringify({
            organizationId: stockItem.organizationId,
            siteId: stockItem.siteId,
          }),
          stockItem.updatedAt,
        ],
      );
    });
  }
  async scheduleAuction(value: Readonly<VehicleAuctionProps>) {
    try {
      await this.tx(value.tenantId, async (client) => {
        await client.query(
          `INSERT INTO vehicle_auctions(id,tenant_id,organization_id,site_id,stock_item_id,channel,starting_price_cents,reserve_price_cents,minimum_increment_cents,guarantee_amount_cents,currency,guarantee_required,starts_at,ends_at,status,created_by,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'scheduled',$15,$16)`,
          [
            value.id,
            value.tenantId,
            value.organizationId,
            value.siteId,
            value.stockItemId,
            value.channel,
            value.startingPriceCents,
            value.reservePriceCents,
            value.minimumIncrementCents,
            value.guaranteeAmountCents,
            value.currency,
            value.guaranteeRequired,
            value.startsAt,
            value.endsAt,
            value.createdBy,
            value.createdAt,
          ],
        );
        await client.query(
          `INSERT INTO outbox_events(id,tenant_id,aggregate_id,event_type,payload,occurred_at) VALUES(gen_random_uuid(),$1,$2,'commerce.vehicle_auction_scheduled.v1',$3,$4)`,
          [
            value.tenantId,
            value.id,
            JSON.stringify({
              organizationId: value.organizationId,
              siteId: value.siteId,
              stockItemId: value.stockItemId,
              channel: value.channel,
              startsAt: value.startsAt,
              endsAt: value.endsAt,
              guaranteeAmountCents: value.guaranteeAmountCents,
              currency: value.currency,
            }),
            value.createdAt,
          ],
        );
      });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "23505")
        throw new DomainError(
          "AUCTION_ALREADY_OPEN",
          "An open auction already exists for this vehicle",
        );
      throw error;
    }
  }
  async authorizeAuctionGuarantee(
    value: Readonly<VehicleAuctionGuaranteeProps>,
  ) {
    try {
      return await this.tx(value.tenantId, async (client) => {
        const existing = await client.query(
          `SELECT id,tenant_id AS "tenantId",organization_id AS "organizationId",site_id AS "siteId",auction_id AS "auctionId",stock_item_id AS "stockItemId",bidder_customer_id AS "bidderCustomerId",provider,provider_reference AS "providerReference",idempotency_key AS "idempotencyKey",amount_cents AS "amountCents",currency,status,authorized_at AS "authorizedAt",closed_at AS "closedAt",closed_reason AS "closedReason" FROM vehicle_auction_guarantees WHERE tenant_id=$1 AND idempotency_key=$2`,
          [value.tenantId, value.idempotencyKey],
        );
        if (existing.rows[0]) {
          const replay = existing.rows[0] as VehicleAuctionGuaranteeProps;
          if (!isCanonicalGuaranteeReplay(replay, value))
            throw new DomainError(
              "AUCTION_GUARANTEE_IDEMPOTENCY_CONFLICT",
              "Idempotency key was already used with a different guarantee request",
            );
          return replay;
        }
        await client.query(
          `INSERT INTO vehicle_auction_guarantees(id,tenant_id,organization_id,site_id,auction_id,stock_item_id,bidder_customer_id,provider,provider_reference,idempotency_key,amount_cents,currency,status,authorized_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'authorized',$13)`,
          [
            value.id,
            value.tenantId,
            value.organizationId,
            value.siteId,
            value.auctionId,
            value.stockItemId,
            value.bidderCustomerId,
            value.provider,
            value.providerReference,
            value.idempotencyKey,
            value.amountCents,
            value.currency,
            value.authorizedAt,
          ],
        );
        await client.query(
          `INSERT INTO outbox_events(id,tenant_id,aggregate_id,event_type,payload,occurred_at) VALUES(gen_random_uuid(),$1,$2,'commerce.vehicle_auction_guarantee_authorized.v1',$3,$4)`,
          [
            value.tenantId,
            value.id,
            JSON.stringify({
              organizationId: value.organizationId,
              siteId: value.siteId,
              auctionId: value.auctionId,
              stockItemId: value.stockItemId,
              bidderCustomerId: value.bidderCustomerId,
              amountCents: value.amountCents,
              currency: value.currency,
              provider: value.provider,
            }),
            value.authorizedAt,
          ],
        );
        return value;
      });
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "23505" &&
        "constraint" in error &&
        error.constraint ===
          "vehicle_auction_guarantees_tenant_id_idempotency_key_key"
      ) {
        const replay = await this.tx(value.tenantId, async (client) => {
          const result = await client.query(
            `SELECT id,tenant_id AS "tenantId",organization_id AS "organizationId",site_id AS "siteId",auction_id AS "auctionId",stock_item_id AS "stockItemId",bidder_customer_id AS "bidderCustomerId",provider,provider_reference AS "providerReference",idempotency_key AS "idempotencyKey",amount_cents AS "amountCents",currency,status,authorized_at AS "authorizedAt",closed_at AS "closedAt",closed_reason AS "closedReason" FROM vehicle_auction_guarantees WHERE tenant_id=$1 AND idempotency_key=$2`,
            [value.tenantId, value.idempotencyKey],
          );
          return result.rows[0] as VehicleAuctionGuaranteeProps | undefined;
        });
        if (replay && isCanonicalGuaranteeReplay(replay, value)) return replay;
        throw new DomainError(
          "AUCTION_GUARANTEE_IDEMPOTENCY_CONFLICT",
          "Idempotency key was already used with a different guarantee request",
        );
      }
      if (error instanceof Error && "code" in error && error.code === "23505")
        throw new DomainError(
          "AUCTION_GUARANTEE_ALREADY_AUTHORIZED",
          "An active guarantee already exists for this bidder",
        );
      throw error;
    }
  }
  async placeAuctionBid(value: Readonly<VehicleAuctionBidProps>) {
    await this.tx(value.tenantId, async (client) => {
      await client.query(
        `INSERT INTO vehicle_auction_bids(id,tenant_id,organization_id,site_id,auction_id,stock_item_id,bidder_customer_id,guarantee_id,guarantee_required,amount_cents,placed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,true,$9,$10)`,
        [
          value.id,
          value.tenantId,
          value.organizationId,
          value.siteId,
          value.auctionId,
          value.stockItemId,
          value.bidderCustomerId,
          value.guaranteeId,
          value.amountCents,
          value.placedAt,
        ],
      );
      await client.query(
        `INSERT INTO outbox_events(id,tenant_id,aggregate_id,event_type,payload,occurred_at) VALUES(gen_random_uuid(),$1,$2,'commerce.vehicle_auction_bid_placed.v1',$3,$4)`,
        [
          value.tenantId,
          value.auctionId,
          JSON.stringify({
            organizationId: value.organizationId,
            siteId: value.siteId,
            stockItemId: value.stockItemId,
            bidId: value.id,
            bidderCustomerId: value.bidderCustomerId,
            guaranteeId: value.guaranteeId,
            amountCents: value.amountCents,
          }),
          value.placedAt,
        ],
      );
    });
  }
  async closeAuction(
    value: Readonly<VehicleAuctionProps>,
    sale?: Readonly<VehicleSaleProps>,
    stockItem?: Readonly<VehicleStockItemProps>,
  ) {
    await this.tx(value.tenantId, async (client) => {
      if (sale) {
        const winner = await client.query(
          `SELECT bidder_customer_id AS "bidderCustomerId",amount_cents AS "amountCents",guarantee_id AS "guaranteeId" FROM vehicle_auction_bids WHERE tenant_id=$1 AND auction_id=$2 AND id=$3 FOR UPDATE`,
          [value.tenantId, value.id, value.winningBidId],
        );
        if (
          winner.rowCount !== 1 ||
          winner.rows[0].bidderCustomerId !== value.winnerCustomerId ||
          winner.rows[0].bidderCustomerId !== sale.buyerCustomerId ||
          winner.rows[0].amountCents !== sale.salePriceCents
        )
          throw new DomainError(
            "AUCTION_AWARD_MISMATCH",
            "Auction award and sale do not match the winning bid",
          );
        if (value.guaranteeRequired) {
          const guarantee = await client.query(
            "SELECT bidder_customer_id FROM vehicle_auction_guarantees WHERE tenant_id=$1 AND id=$2 AND auction_id=$3 AND status='authorized' FOR UPDATE",
            [value.tenantId, winner.rows[0].guaranteeId, value.id],
          );
          if (
            guarantee.rowCount !== 1 ||
            guarantee.rows[0].bidder_customer_id !== sale.buyerCustomerId
          )
            throw new DomainError(
              "AUCTION_AWARD_GUARANTEE_MISMATCH",
              "Winning bid guarantee does not match the auction buyer",
            );
        }
      }
      const updated = await client.query(
        `UPDATE vehicle_auctions SET status=$3,winner_customer_id=$4,winning_bid_id=$5,closed_reason=$6,closed_by=$7,closed_at=$8 WHERE tenant_id=$1 AND id=$2 AND status='scheduled'`,
        [
          value.tenantId,
          value.id,
          value.status,
          value.winnerCustomerId ?? null,
          value.winningBidId ?? null,
          value.closedReason,
          value.closedBy,
          value.closedAt,
        ],
      );
      if (updated.rowCount !== 1)
        throw new DomainError("AUCTION_NOT_OPEN", "Auction is not open");
      const guarantees = await client.query(
        "UPDATE vehicle_auction_guarantees SET status=CASE WHEN $3::uuid IS NOT NULL AND bidder_customer_id=$3 THEN 'captured' ELSE 'released' END,closed_reason=CASE WHEN $3::uuid IS NOT NULL AND bidder_customer_id=$3 THEN 'winner' WHEN $3::uuid IS NOT NULL THEN 'lost' ELSE 'unsold' END,closed_at=$4 WHERE tenant_id=$1 AND auction_id=$2 AND status='authorized' RETURNING id,bidder_customer_id,status,closed_reason,amount_cents,currency",
        [
          value.tenantId,
          value.id,
          sale?.buyerCustomerId ?? null,
          value.closedAt,
        ],
      );
      for (const row of guarantees.rows)
        await client.query(
          `INSERT INTO outbox_events(id,tenant_id,aggregate_id,event_type,payload,occurred_at) VALUES(gen_random_uuid(),$1,$2,$3,$4,$5)`,
          [
            value.tenantId,
            row.id,
            row.status === "captured"
              ? "commerce.vehicle_auction_guarantee_captured.v1"
              : "commerce.vehicle_auction_guarantee_released.v1",
            JSON.stringify({
              organizationId: value.organizationId,
              siteId: value.siteId,
              stockItemId: value.stockItemId,
              auctionId: value.id,
              bidderCustomerId: row.bidder_customer_id,
              amountCents: row.amount_cents,
              currency: row.currency,
              reason: row.closed_reason,
            }),
            value.closedAt,
          ],
        );
      if (sale && stockItem) {
        await client.query(
          `INSERT INTO vehicle_sales(id,tenant_id,organization_id,site_id,stock_item_id,buyer_customer_id,sale_price_cents,acquisition_cost_cents,gross_margin_cents,sold_by,sold_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            sale.id,
            sale.tenantId,
            sale.organizationId,
            sale.siteId,
            sale.stockItemId,
            sale.buyerCustomerId,
            sale.salePriceCents,
            sale.acquisitionCostCents,
            sale.grossMarginCents,
            sale.soldBy,
            sale.soldAt,
          ],
        );
        await client.query(
          "UPDATE vehicle_stock_items SET status='sold',updated_at=$3 WHERE tenant_id=$1 AND id=$2",
          [stockItem.tenantId, stockItem.id, stockItem.updatedAt],
        );
        await client.query(
          "UPDATE vehicle_publications SET status='withdrawn' WHERE tenant_id=$1 AND stock_item_id=$2 AND status='published'",
          [stockItem.tenantId, stockItem.id],
        );
        await client.query(
          "UPDATE vehicle_flash_sales SET status='closed',closed_reason='sold',closed_by=$3,closed_at=$4 WHERE tenant_id=$1 AND stock_item_id=$2 AND status='scheduled'",
          [sale.tenantId, sale.stockItemId, sale.soldBy, sale.soldAt],
        );
        await client.query(
          `INSERT INTO outbox_events(id,tenant_id,aggregate_id,event_type,payload,occurred_at) VALUES(gen_random_uuid(),$1,$2,'commerce.vehicle_sold.v1',$3,$4)`,
          [
            sale.tenantId,
            sale.id,
            JSON.stringify({
              organizationId: sale.organizationId,
              siteId: sale.siteId,
              stockItemId: sale.stockItemId,
              buyerCustomerId: sale.buyerCustomerId,
              salePriceCents: sale.salePriceCents,
              grossMarginCents: sale.grossMarginCents,
              source: "auction",
              auctionId: value.id,
            }),
            sale.soldAt,
          ],
        );
      }
      await client.query(
        `INSERT INTO outbox_events(id,tenant_id,aggregate_id,event_type,payload,occurred_at) VALUES(gen_random_uuid(),$1,$2,$3,$4,$5)`,
        [
          value.tenantId,
          value.id,
          value.status === "sold"
            ? "commerce.vehicle_auction_awarded.v1"
            : "commerce.vehicle_auction_closed.v1",
          JSON.stringify({
            organizationId: value.organizationId,
            siteId: value.siteId,
            stockItemId: value.stockItemId,
            status: value.status,
            winnerCustomerId: value.winnerCustomerId ?? null,
            winningBidId: value.winningBidId ?? null,
          }),
          value.closedAt,
        ],
      );
    });
  }
}
