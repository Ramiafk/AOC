ALTER TABLE vehicle_stock_items DROP CONSTRAINT vehicle_stock_items_status_check;
ALTER TABLE vehicle_stock_items ADD CONSTRAINT vehicle_stock_items_status_check CHECK(status IN('acquired','preparing','ready','published','withdrawn','sold','delivered'));

ALTER TABLE vehicle_sales ADD CONSTRAINT vehicle_sales_scope_id_unique UNIQUE(tenant_id,organization_id,site_id,stock_item_id,id);

CREATE TABLE vehicle_deliveries(
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL, site_id uuid NOT NULL,
  stock_item_id uuid NOT NULL, sale_id uuid NOT NULL, status text NOT NULL CHECK(status IN('scheduled','completed')),
  planned_at timestamptz NOT NULL, handover_odometer_km integer CHECK(handover_odometer_km>=0), notes text,
  scheduled_by uuid NOT NULL, completed_by uuid, completed_at timestamptz, created_at timestamptz NOT NULL,
  UNIQUE(tenant_id,id), UNIQUE(tenant_id,stock_item_id),
  CHECK((status='scheduled' AND completed_by IS NULL AND completed_at IS NULL AND handover_odometer_km IS NULL) OR (status='completed' AND completed_by IS NOT NULL AND completed_at IS NOT NULL AND handover_odometer_km IS NOT NULL)),
  CONSTRAINT vehicle_deliveries_sale_scope_fk FOREIGN KEY(tenant_id,organization_id,site_id,stock_item_id,sale_id) REFERENCES vehicle_sales(tenant_id,organization_id,site_id,stock_item_id,id)
);

CREATE INDEX vehicle_deliveries_schedule_idx ON vehicle_deliveries(tenant_id,organization_id,site_id,status,planned_at);
ALTER TABLE vehicle_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_deliveries FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON vehicle_deliveries USING(tenant_id=current_setting('app.tenant_id',true)::uuid) WITH CHECK(tenant_id=current_setting('app.tenant_id',true)::uuid);
