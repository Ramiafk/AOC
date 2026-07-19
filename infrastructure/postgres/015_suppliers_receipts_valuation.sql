ALTER TABLE stock_positions ADD COLUMN average_unit_cost_cents integer NOT NULL DEFAULT 0 CHECK(average_unit_cost_cents >= 0);

CREATE TABLE suppliers(
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  organization_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  email text,
  active boolean NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,organization_id,code),
  CONSTRAINT suppliers_tenant_organization_fk FOREIGN KEY(tenant_id,organization_id) REFERENCES organizations(tenant_id,id)
);

ALTER TABLE purchase_orders
  ADD CONSTRAINT purchase_orders_tenant_supplier_fk FOREIGN KEY(tenant_id,supplier_id) REFERENCES suppliers(tenant_id,id);

CREATE TABLE goods_receipts(
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  organization_id uuid NOT NULL,
  site_id uuid NOT NULL,
  purchase_order_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  received_by uuid NOT NULL,
  received_at timestamptz NOT NULL,
  UNIQUE(tenant_id,id),
  CONSTRAINT goods_receipts_tenant_organization_fk FOREIGN KEY(tenant_id,organization_id) REFERENCES organizations(tenant_id,id),
  CONSTRAINT goods_receipts_tenant_site_fk FOREIGN KEY(tenant_id,site_id) REFERENCES sites(tenant_id,id),
  CONSTRAINT goods_receipts_tenant_order_fk FOREIGN KEY(tenant_id,purchase_order_id) REFERENCES purchase_orders(tenant_id,id),
  CONSTRAINT goods_receipts_tenant_supplier_fk FOREIGN KEY(tenant_id,supplier_id) REFERENCES suppliers(tenant_id,id)
);

CREATE TABLE goods_receipt_lines(
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  receipt_id uuid NOT NULL,
  part_id uuid NOT NULL,
  quantity numeric NOT NULL CHECK(quantity > 0),
  unit_cost_cents integer NOT NULL CHECK(unit_cost_cents >= 0),
  PRIMARY KEY(tenant_id,receipt_id,part_id),
  CONSTRAINT receipt_lines_tenant_receipt_fk FOREIGN KEY(tenant_id,receipt_id) REFERENCES goods_receipts(tenant_id,id),
  CONSTRAINT receipt_lines_tenant_part_fk FOREIGN KEY(tenant_id,part_id) REFERENCES parts(tenant_id,id)
);

CREATE INDEX goods_receipts_order_idx ON goods_receipts(tenant_id,purchase_order_id,received_at);

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['suppliers','goods_receipts','goods_receipt_lines'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id=current_setting(''app.tenant_id'',true)::uuid) WITH CHECK (tenant_id=current_setting(''app.tenant_id'',true)::uuid)',table_name);
  END LOOP;
END $$;
