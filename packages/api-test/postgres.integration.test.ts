import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { Pool } from "pg";
import { loadMigrations, migrate } from "../../infrastructure/postgres/migrate.ts";

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
