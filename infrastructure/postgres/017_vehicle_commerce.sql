CREATE TABLE vehicle_stock_items(
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  organization_id uuid NOT NULL,
  site_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  acquisition_mode text NOT NULL CHECK(acquisition_mode IN('purchase','trade_in','consignment')),
  acquisition_cost_cents integer NOT NULL CHECK(acquisition_cost_cents>=0),
  asking_price_cents integer CHECK(asking_price_cents>0),
  status text NOT NULL CHECK(status IN('acquired','preparing','ready','published','withdrawn','sold')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,asset_id),
  CONSTRAINT vehicle_stock_tenant_organization_fk FOREIGN KEY(tenant_id,organization_id) REFERENCES organizations(tenant_id,id),
  CONSTRAINT vehicle_stock_tenant_site_fk FOREIGN KEY(tenant_id,site_id) REFERENCES sites(tenant_id,id),
  CONSTRAINT vehicle_stock_tenant_asset_fk FOREIGN KEY(tenant_id,asset_id) REFERENCES assets(tenant_id,id)
);

CREATE TABLE vehicle_publications(
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  organization_id uuid NOT NULL,
  site_id uuid NOT NULL,
  stock_item_id uuid NOT NULL,
  channel text NOT NULL CHECK(channel IN('professional_website','professional_app','central_marketplace')),
  asking_price_cents integer NOT NULL CHECK(asking_price_cents>0),
  status text NOT NULL CHECK(status IN('published','withdrawn')),
  published_by uuid NOT NULL,
  published_at timestamptz NOT NULL,
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,stock_item_id,channel),
  CONSTRAINT vehicle_publications_tenant_organization_fk FOREIGN KEY(tenant_id,organization_id) REFERENCES organizations(tenant_id,id),
  CONSTRAINT vehicle_publications_tenant_site_fk FOREIGN KEY(tenant_id,site_id) REFERENCES sites(tenant_id,id),
  CONSTRAINT vehicle_publications_tenant_stock_fk FOREIGN KEY(tenant_id,stock_item_id) REFERENCES vehicle_stock_items(tenant_id,id)
);

CREATE INDEX vehicle_stock_browse_idx ON vehicle_stock_items(tenant_id,organization_id,site_id,status,updated_at DESC);
CREATE INDEX vehicle_publications_channel_idx ON vehicle_publications(tenant_id,channel,status,published_at DESC);

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['vehicle_stock_items','vehicle_publications'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id=current_setting(''app.tenant_id'',true)::uuid) WITH CHECK (tenant_id=current_setting(''app.tenant_id'',true)::uuid)',table_name);
  END LOOP;
END $$;
