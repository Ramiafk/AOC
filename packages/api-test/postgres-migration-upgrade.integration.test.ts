import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { Pool } from "pg";
import { loadMigrations, migrate } from "../../infrastructure/postgres/migrate.ts";

const connectionString = process.env.TEST_DATABASE_URL;

test(
  "migration 027 preserves populated 5H bids and requires guarantees for new writes",
  { skip: !connectionString },
  async () => {
    const schema = `migration_027_${randomBytes(6).toString("hex")}`;
    const admin = new Pool({ connectionString });
    await admin.query(`CREATE SCHEMA ${schema}`);
    const pool = new Pool({ connectionString, options: `-c search_path=${schema}` });
    try {
      const migrations = await loadMigrations(resolve("infrastructure/postgres"));
      await migrate(pool, migrations.filter((migration) => migration.version <= "026"));
      const tenant = "41111111-1111-4111-8111-111111111111";
      const organization = "4aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
      const site = "4bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
      const customer = "4ccccccc-cccc-4ccc-8ccc-cccccccccccc";
      const actor = "4ddddddd-dddd-4ddd-8ddd-dddddddddddd";
      const asset = "4eeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
      const stock = "4fffffff-ffff-4fff-8fff-ffffffffffff";
      const auction = "47777777-7777-4777-8777-777777777777";
      const historicalBid = "48888888-8888-4888-8888-888888888888";
      await pool.query(
        "INSERT INTO tenants(id,slug,display_name) VALUES($1,'migration-027','Migration 027')",
        [tenant],
      );
      await pool.query(
        "INSERT INTO organizations(id,tenant_id,legal_name,display_name,country_code,activities,created_at) VALUES($1,$2,'Migration','Migration','FR',ARRAY['dealer'],now())",
        [organization, tenant],
      );
      await pool.query(
        "INSERT INTO sites(id,tenant_id,organization_id,name,country_code,timezone,activities,created_at) VALUES($1,$2,$3,'Migration','FR','Europe/Paris',ARRAY['dealer'],now())",
        [site, tenant, organization],
      );
      await pool.query(
        "INSERT INTO customers(id,tenant_id,kind,display_name,email,acquisition_channel,acquisition_owner_organization_id,created_at) VALUES($1,$2,'individual','Bidder','migration@example.test','staff',$3,now())",
        [customer, tenant, organization],
      );
      await pool.query(
        "INSERT INTO assets(id,tenant_id,owner_customer_id,kind,vin_or_serial,attributes,created_at) VALUES($1,$2,$3,'car','VIN-MIGRATION-027','{}',now())",
        [asset, tenant, customer],
      );
      await pool.query(
        "INSERT INTO vehicle_stock_items(id,tenant_id,organization_id,site_id,asset_id,acquisition_mode,acquisition_cost_cents,asking_price_cents,status,created_by,created_at,updated_at) VALUES($1,$2,$3,$4,$5,'purchase',100,200,'published',$6,now(),now())",
        [stock, tenant, organization, site, asset, actor],
      );
      await pool.query(
        "INSERT INTO vehicle_auctions(id,tenant_id,organization_id,site_id,stock_item_id,channel,starting_price_cents,reserve_price_cents,minimum_increment_cents,starts_at,ends_at,status,created_by,created_at) VALUES($1,$2,$3,$4,$5,'central_marketplace',100,150,10,now()-interval '2 hours',now()-interval '1 hour','scheduled',$6,now()-interval '2 hours')",
        [auction, tenant, organization, site, stock, actor],
      );
      await pool.query(
        "INSERT INTO vehicle_auction_bids(id,tenant_id,organization_id,site_id,auction_id,stock_item_id,bidder_customer_id,amount_cents,placed_at) VALUES($1,$2,$3,$4,$5,$6,$7,120,now()-interval '90 minutes')",
        [historicalBid, tenant, organization, site, auction, stock, customer],
      );

      await migrate(pool, migrations);

      const preserved = await pool.query(
        "SELECT guarantee_id,guarantee_required FROM vehicle_auction_bids WHERE id=$1",
        [historicalBid],
      );
      assert.equal(preserved.rows[0].guarantee_id, null);
      assert.equal(preserved.rows[0].guarantee_required, false);
      await assert.rejects(
        () =>
          pool.query(
            "INSERT INTO vehicle_auction_bids(id,tenant_id,organization_id,site_id,auction_id,stock_item_id,bidder_customer_id,amount_cents,placed_at) VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$6,130,now())",
            [tenant, organization, site, auction, stock, customer],
          ),
        /vehicle_auction_bid_guarantee_presence_check|vehicle_auction_bid_guarantee_mode_fk/,
      );
      await pool.query(
        "UPDATE vehicle_auctions SET status='unsold',closed_reason='reserve_not_met',closed_by=$2,closed_at=now() WHERE id=$1",
        [auction, actor],
      );
      assert.equal(
        (await pool.query("SELECT status FROM vehicle_auctions WHERE id=$1", [auction])).rows[0].status,
        "unsold",
      );
    } finally {
      await pool.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    }
  },
);
