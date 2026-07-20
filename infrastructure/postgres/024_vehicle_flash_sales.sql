CREATE TABLE vehicle_flash_sales(
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  organization_id uuid NOT NULL,
  site_id uuid NOT NULL,
  stock_item_id uuid NOT NULL,
  price_cents integer NOT NULL CHECK(price_cents>0),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  channels text[] NOT NULL CHECK(cardinality(channels)>0 AND channels<@ARRAY['professional_website','professional_app','central_marketplace']::text[]),
  status text NOT NULL CHECK(status IN('scheduled','cancelled')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL,
  cancelled_by uuid,
  cancelled_at timestamptz,
  UNIQUE(tenant_id,id),
  CONSTRAINT vehicle_flash_sale_window_check CHECK(ends_at>starts_at),
  CONSTRAINT vehicle_flash_sale_cancel_check CHECK((status='scheduled' AND cancelled_by IS NULL AND cancelled_at IS NULL) OR (status='cancelled' AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL)),
  CONSTRAINT vehicle_flash_sale_scope_fk FOREIGN KEY(tenant_id,organization_id,site_id,stock_item_id) REFERENCES vehicle_stock_items(tenant_id,organization_id,site_id,id)
);

CREATE UNIQUE INDEX vehicle_flash_sales_one_open_uidx ON vehicle_flash_sales(tenant_id,stock_item_id) WHERE status='scheduled';
CREATE INDEX vehicle_flash_sales_window_idx ON vehicle_flash_sales(tenant_id,organization_id,site_id,status,starts_at,ends_at);

ALTER TABLE vehicle_flash_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_flash_sales FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON vehicle_flash_sales
  USING(tenant_id=current_setting('app.tenant_id',true)::uuid)
  WITH CHECK(tenant_id=current_setting('app.tenant_id',true)::uuid);
