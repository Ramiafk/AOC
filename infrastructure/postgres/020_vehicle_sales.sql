CREATE TABLE vehicle_sales(
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL, site_id uuid NOT NULL,
  stock_item_id uuid NOT NULL, buyer_customer_id uuid NOT NULL, sale_price_cents integer NOT NULL CHECK(sale_price_cents>0),
  acquisition_cost_cents integer NOT NULL CHECK(acquisition_cost_cents>=0), gross_margin_cents integer NOT NULL,
  sold_by uuid NOT NULL, sold_at timestamptz NOT NULL,
  UNIQUE(tenant_id,id), UNIQUE(tenant_id,stock_item_id),
  CONSTRAINT vehicle_sales_stock_scope_fk FOREIGN KEY(tenant_id,organization_id,site_id,stock_item_id) REFERENCES vehicle_stock_items(tenant_id,organization_id,site_id,id),
  CONSTRAINT vehicle_sales_buyer_fk FOREIGN KEY(tenant_id,buyer_customer_id) REFERENCES customers(tenant_id,id)
);
CREATE INDEX vehicle_sales_margin_idx ON vehicle_sales(tenant_id,organization_id,site_id,sold_at DESC);
ALTER TABLE vehicle_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_sales FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON vehicle_sales USING(tenant_id=current_setting('app.tenant_id',true)::uuid) WITH CHECK(tenant_id=current_setting('app.tenant_id',true)::uuid);
