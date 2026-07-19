CREATE TABLE vehicle_preparation_checks(
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL, site_id uuid NOT NULL,
  stock_item_id uuid NOT NULL, label text NOT NULL CHECK(length(trim(label))>=2), required boolean NOT NULL,
  completed_by uuid, completed_at timestamptz, created_at timestamptz NOT NULL,
  UNIQUE(tenant_id,id),
  CHECK((completed_by IS NULL)=(completed_at IS NULL)),
  CONSTRAINT preparation_checks_stock_scope_fk FOREIGN KEY(tenant_id,organization_id,site_id,stock_item_id) REFERENCES vehicle_stock_items(tenant_id,organization_id,site_id,id)
);

CREATE TABLE vehicle_media(
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL, site_id uuid NOT NULL,
  stock_item_id uuid NOT NULL, kind text NOT NULL CHECK(kind IN('image','video')), storage_key text NOT NULL,
  position integer NOT NULL CHECK(position>=0), is_primary boolean NOT NULL, created_by uuid NOT NULL, created_at timestamptz NOT NULL,
  UNIQUE(tenant_id,id), UNIQUE(tenant_id,storage_key), UNIQUE(tenant_id,stock_item_id,position),
  CONSTRAINT vehicle_media_stock_scope_fk FOREIGN KEY(tenant_id,organization_id,site_id,stock_item_id) REFERENCES vehicle_stock_items(tenant_id,organization_id,site_id,id)
);

CREATE UNIQUE INDEX vehicle_media_one_primary_idx ON vehicle_media(tenant_id,stock_item_id) WHERE is_primary;
CREATE INDEX preparation_checks_pending_idx ON vehicle_preparation_checks(tenant_id,stock_item_id,required) WHERE completed_at IS NULL;

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['vehicle_preparation_checks','vehicle_media'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id=current_setting(''app.tenant_id'',true)::uuid) WITH CHECK (tenant_id=current_setting(''app.tenant_id'',true)::uuid)',table_name);
  END LOOP;
END $$;
