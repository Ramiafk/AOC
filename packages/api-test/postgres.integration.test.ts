import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { Pool } from "pg";
import { loadMigrations, migrate } from "../../infrastructure/postgres/migrate.ts";
import { PostgresInventoryRepository } from "../../infrastructure/postgres/postgres-inventory-repository.ts";
import { newEntityId, tenantId, type RequestContext } from "../core/src/identity.ts";
import { ManageInventory } from "../inventory/src/manage-inventory.ts";
import { PostgresVehicleCommerceRepository } from "../../infrastructure/postgres/postgres-vehicle-commerce-repository.ts";
import { ManageVehicleCommerce } from "../vehicle-commerce/src/vehicle-commerce.ts";

const connectionString=process.env.TEST_DATABASE_URL;
test("PostgreSQL enforces RLS, composite tenant FKs and transactional outbox",{skip:!connectionString},async()=>{
  const pool=new Pool({connectionString});
  try{
    await migrate(pool,await loadMigrations(resolve("infrastructure/postgres")));
    const db=await pool.connect();
    try{
      const t1="11111111-1111-4111-8111-111111111111",t2="22222222-2222-4222-8222-222222222222",o1="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",o2="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",c1="cccccccc-cccc-4ccc-8ccc-cccccccccccc",supplier="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
      await db.query("INSERT INTO tenants(id,slug,display_name) VALUES($1,'t1','Tenant 1'),($2,'t2','Tenant 2') ON CONFLICT DO NOTHING",[t1,t2]);
      await db.query("INSERT INTO organizations(id,tenant_id,legal_name,display_name,country_code,activities,created_at) VALUES($1,$2,'O1','O1','FR',ARRAY['workshop'],now()),($3,$4,'O2','O2','FR',ARRAY['workshop'],now()) ON CONFLICT DO NOTHING",[o1,t1,o2,t2]);
      await assert.rejects(()=>db.query("INSERT INTO sites(id,tenant_id,organization_id,name,country_code,timezone,activities,created_at) VALUES(gen_random_uuid(),$1,$2,'Cross','FR','Europe/Paris',ARRAY['workshop'],now())",[t1,o2]),/foreign key/i);
      await db.query("INSERT INTO customers(id,tenant_id,kind,display_name,email,acquisition_channel,acquisition_owner_organization_id,created_at) VALUES($1,$2,'individual','Client','c@example.com','staff',$3,now()) ON CONFLICT DO NOTHING",[c1,t1,o1]);
      await db.query("INSERT INTO suppliers(id,tenant_id,organization_id,code,name,active,created_at) VALUES($1,$2,$3,'SUP-1','Supplier',true,now()) ON CONFLICT DO NOTHING",[supplier,t1,o1]);
      await assert.rejects(()=>db.query("INSERT INTO suppliers(id,tenant_id,organization_id,code,name,active,created_at) VALUES(gen_random_uuid(),$1,$2,'CROSS','Cross',true,now())",[t1,o2]),/foreign key/i);
      await db.query("DROP ROLE IF EXISTS aos_app_test; CREATE ROLE aos_app_test NOLOGIN; GRANT USAGE ON SCHEMA public TO aos_app_test; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO aos_app_test");
      await db.query("SET ROLE aos_app_test");await db.query("SELECT set_config('app.tenant_id',$1,false)",[t1]);
      const visible=await db.query("SELECT id FROM organizations");assert.deepEqual(visible.rows.map(x=>x.id),[o1]);assert.deepEqual((await db.query("SELECT id FROM suppliers")).rows.map(x=>x.id),[supplier]);
      await db.query("BEGIN");await db.query("SELECT set_config('app.tenant_id',$1,true)",[t1]);const asset="dddddddd-dddd-4ddd-8ddd-dddddddddddd";await db.query("INSERT INTO assets(id,tenant_id,owner_customer_id,kind,vin_or_serial,attributes,created_at) VALUES($1,$2,$3,'car','VIN-TX','{}',now())",[asset,t1,c1]);await db.query("INSERT INTO outbox_events(id,tenant_id,aggregate_id,event_type,payload,occurred_at) VALUES(gen_random_uuid(),$1,$2,'AssetRegistered','{}',now())",[t1,asset]);await db.query("ROLLBACK");
      await db.query("RESET ROLE");assert.equal((await db.query("SELECT count(*)::int n FROM assets WHERE id=$1",[asset])).rows[0].n,0);assert.equal((await db.query("SELECT count(*)::int n FROM outbox_events WHERE aggregate_id=$1",[asset])).rows[0].n,0);
    }finally{db.release();}
    await assert.rejects(()=>migrate(pool,[{version:"999",name:"999_failure.sql",checksum:"bad",sql:"CREATE TABLE migration_should_rollback(id int); SELECT missing_column FROM missing_table;"}]));
    assert.equal((await pool.query("SELECT count(*)::int n FROM schema_migrations WHERE version='999'")).rows[0].n,0);
  }finally{await pool.end();}
});

test("PostgreSQL inventory adapter sets RLS context and serializes concurrent receipts",{skip:!connectionString},async()=>{
  const adminPool=new Pool({connectionString});
  const role="aos_inventory_adapter_test";
  let applicationPool: Pool | undefined;
  try {
    await migrate(adminPool,await loadMigrations(resolve("infrastructure/postgres")));
    const password=randomBytes(24).toString("hex");
    const rolePasswordSql=await adminPool.query<{sql:string}>("SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD %L',$1::text,$2::text) AS sql",[role,password]);
    await adminPool.query(`DROP OWNED BY ${role}`).catch(()=>undefined);
    await adminPool.query(`DROP ROLE IF EXISTS ${role}`);
    await adminPool.query(rolePasswordSql.rows[0]!.sql);
    const connectGrant=await adminPool.query<{sql:string}>("SELECT format('GRANT CONNECT ON DATABASE %I TO %I',current_database(),$1::text) AS sql",[role]);
    await adminPool.query(connectGrant.rows[0]!.sql);
    await adminPool.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await adminPool.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role}`);
    await adminPool.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);

    const t1="31111111-1111-4111-8111-111111111111";
    const t2="32222222-2222-4222-8222-222222222222";
    const organizationId=newEntityId();
    const siteId=newEntityId();
    const otherOrganizationId=newEntityId();
    const otherSiteId=newEntityId();
    const customerId=newEntityId();
    const assetId=newEntityId();
    const otherAssetId=newEntityId();
    await adminPool.query("INSERT INTO tenants(id,slug,display_name) VALUES($1,$3,$3),($2,$4,$4) ON CONFLICT DO NOTHING",[t1,t2,`inventory-${t1}`,`inventory-${t2}`]);
    await adminPool.query("INSERT INTO organizations(id,tenant_id,legal_name,display_name,country_code,activities,created_at) VALUES($1,$2,'Inventory','Inventory','FR',ARRAY['workshop'],now())",[organizationId,t1]);
    await adminPool.query("INSERT INTO organizations(id,tenant_id,legal_name,display_name,country_code,activities,created_at) VALUES($1,$2,'Other','Other','FR',ARRAY['dealer'],now())",[otherOrganizationId,t1]);
    await adminPool.query("INSERT INTO sites(id,tenant_id,organization_id,name,country_code,timezone,activities,created_at) VALUES($1,$2,$3,'Main','FR','Europe/Paris',ARRAY['workshop'],now())",[siteId,t1,organizationId]);
    await adminPool.query("INSERT INTO sites(id,tenant_id,organization_id,name,country_code,timezone,activities,created_at) VALUES($1,$2,$3,'Other','FR','Europe/Paris',ARRAY['dealer'],now())",[otherSiteId,t1,otherOrganizationId]);
    await adminPool.query("INSERT INTO customers(id,tenant_id,kind,display_name,email,acquisition_channel,acquisition_owner_organization_id,created_at) VALUES($1,$2,'individual','Seller','seller@example.test','staff',$3,now())",[customerId,t1,organizationId]);
    await adminPool.query("INSERT INTO assets(id,tenant_id,owner_customer_id,kind,vin_or_serial,attributes,created_at) VALUES($1,$2,$3,'car',$4,'{}',now())",[assetId,t1,customerId,`VIN-${assetId}`]);
    await adminPool.query("INSERT INTO assets(id,tenant_id,owner_customer_id,kind,vin_or_serial,attributes,created_at) VALUES($1,$2,$3,'car',$4,'{}',now())",[otherAssetId,t1,customerId,`VIN-${otherAssetId}`]);

    const applicationUrl=new URL(connectionString!);
    applicationUrl.username=role;
    applicationUrl.password=password;
    applicationPool=new Pool({connectionString:applicationUrl.toString(),max:4});
    const repository=new PostgresInventoryRepository(applicationPool);
    const service=new ManageInventory(repository,()=>new Date("2026-07-20T18:00:00Z"));
    const context: RequestContext={tenantId:tenantId(t1),actorId:newEntityId(),correlationId:"postgres-concurrency"};
    const part=await service.createPart(context,{organizationId,sku:"PG-CONCURRENT",name:"Concurrent part",unitCostCents:800,salePriceCents:1600,reorderPoint:1,reorderQuantity:5});
    const supplier=await service.createSupplier(context,{organizationId,code:"PG-SUP",name:"PostgreSQL supplier"});
    const order=await service.createPurchaseOrder(context,{organizationId,siteId,supplierId:supplier.id,lines:[{partId:part.id,quantity:5,unitCostCents:1000}]});
    await service.order(context,order.id);

    assert.equal((await adminPool.query("SELECT rolsuper FROM pg_roles WHERE rolname=$1",[role])).rows[0].rolsuper,false);
    assert.equal(await repository.findSupplier(tenantId(t2),supplier.id),null);
    const receipts=await Promise.allSettled([
      service.receivePurchaseOrder(context,order.id,[{partId:part.id,quantity:4,unitCostCents:1000}]),
      service.receivePurchaseOrder(context,order.id,[{partId:part.id,quantity:4,unitCostCents:1200}])
    ]);
    assert.equal(receipts.filter(result=>result.status==="fulfilled").length,1);
    assert.equal(receipts.filter(result=>result.status==="rejected").length,1);
    assert.equal((await adminPool.query("SELECT count(*)::int AS count FROM goods_receipts WHERE tenant_id=$1 AND purchase_order_id=$2",[t1,order.id])).rows[0].count,1);
    assert.equal((await repository.findPosition(context.tenantId,siteId,part.id))?.onHand,4);
    await service.returnToSupplier(context,order.id,[{partId:part.id,quantity:2}],"Damaged in transit");
    await assert.rejects(()=>service.returnToSupplier(context,order.id,[{partId:part.id,quantity:3}],"Exceeds receipt"));
    assert.equal((await service.cancelRemainder(context,order.id)).status,"closed");
    assert.equal((await adminPool.query("SELECT count(*)::int AS count FROM supplier_returns WHERE tenant_id=$1 AND purchase_order_id=$2",[t1,order.id])).rows[0].count,1);
    assert.equal((await adminPool.query("SELECT count(*)::int AS count FROM outbox_events WHERE tenant_id=$1 AND aggregate_id=$2 AND event_type='inventory.purchase_remainder_closed.v1'",[t1,order.id])).rows[0].count,1);
    assert.equal((await repository.findPosition(context.tenantId,siteId,part.id))?.onHand,2);
    const lowPart=await service.createPart(context,{organizationId,sku:"PG-LOW",name:"Low stock",unitCostCents:100,salePriceCents:200,reorderPoint:1,reorderQuantity:6});
    const alerts=await service.replenishmentAlerts(context,organizationId,siteId);
    assert.deepEqual(alerts.map(alert=>alert.partId),[lowPart.id]);
    assert.deepEqual(await repository.listReturns(tenantId(t2),order.id),[]);
    const commerceRepository=new PostgresVehicleCommerceRepository(applicationPool);
    const commerce=new ManageVehicleCommerce(commerceRepository,()=>new Date("2026-07-22T10:00:00Z"));
    const stockItem=await commerce.acquire(context,{organizationId,siteId,assetId,acquisitionMode:"trade_in",acquisitionCostCents:1200000});
    await commerce.startPreparation(context,stockItem.id);
    await commerce.markReady(context,stockItem.id,1590000);
    const publicationResults=await Promise.allSettled([commerce.publish(context,stockItem.id,"central_marketplace"),commerce.publish(context,stockItem.id,"central_marketplace")]);
    assert.equal(publicationResults.filter(result=>result.status==="fulfilled").length,1);
    assert.equal((await adminPool.query("SELECT count(*)::int AS count FROM vehicle_publications WHERE tenant_id=$1 AND stock_item_id=$2",[t1,stockItem.id])).rows[0].count,1);
    assert.equal((await adminPool.query("SELECT count(*)::int AS count FROM outbox_events WHERE tenant_id=$1 AND event_type='commerce.vehicle_published.v1' AND payload->>'stockItemId'=$2",[t1,stockItem.id])).rows[0].count,1);
    assert.equal(await commerceRepository.findStockItem(tenantId(t2),stockItem.id),null);
    await assert.rejects(()=>adminPool.query(`INSERT INTO vehicle_stock_items(id,tenant_id,organization_id,site_id,asset_id,acquisition_mode,acquisition_cost_cents,status,created_by,created_at,updated_at) VALUES(gen_random_uuid(),$1,$2,$3,$4,'purchase',100,'acquired',$5,now(),now())`,[t1,organizationId,otherSiteId,otherAssetId,context.actorId]),/vehicle_stock_tenant_organization_site_fk/);
    await assert.rejects(()=>adminPool.query(`INSERT INTO vehicle_publications(id,tenant_id,organization_id,site_id,stock_item_id,channel,asking_price_cents,status,published_by,published_at) VALUES(gen_random_uuid(),$1,$2,$3,$4,'professional_website',1590000,'published',$5,now())`,[t1,otherOrganizationId,otherSiteId,stockItem.id,context.actorId]),/vehicle_publications_tenant_stock_scope_fk/);
  } finally {
    if(applicationPool) await applicationPool.end();
    await adminPool.query(`DROP OWNED BY ${role}`).catch(()=>undefined);
    await adminPool.query(`DROP ROLE IF EXISTS ${role}`).catch(()=>undefined);
    await adminPool.end();
  }
});
