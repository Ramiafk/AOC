CREATE TABLE supplier_returns(
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  organization_id uuid NOT NULL,
  site_id uuid NOT NULL,
  purchase_order_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  reason text NOT NULL CHECK(length(trim(reason)) >= 3),
  returned_by uuid NOT NULL,
  returned_at timestamptz NOT NULL,
  UNIQUE(tenant_id,id),
  CONSTRAINT supplier_returns_tenant_organization_fk FOREIGN KEY(tenant_id,organization_id) REFERENCES organizations(tenant_id,id),
  CONSTRAINT supplier_returns_tenant_site_fk FOREIGN KEY(tenant_id,site_id) REFERENCES sites(tenant_id,id),
  CONSTRAINT supplier_returns_tenant_order_fk FOREIGN KEY(tenant_id,purchase_order_id) REFERENCES purchase_orders(tenant_id,id),
  CONSTRAINT supplier_returns_tenant_supplier_fk FOREIGN KEY(tenant_id,supplier_id) REFERENCES suppliers(tenant_id,id)
);

CREATE TABLE supplier_return_lines(
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  supplier_return_id uuid NOT NULL,
  part_id uuid NOT NULL,
  quantity numeric NOT NULL CHECK(quantity > 0),
  PRIMARY KEY(tenant_id,supplier_return_id,part_id),
  CONSTRAINT supplier_return_lines_tenant_return_fk FOREIGN KEY(tenant_id,supplier_return_id) REFERENCES supplier_returns(tenant_id,id),
  CONSTRAINT supplier_return_lines_tenant_part_fk FOREIGN KEY(tenant_id,part_id) REFERENCES parts(tenant_id,id)
);

CREATE INDEX supplier_returns_order_idx ON supplier_returns(tenant_id,purchase_order_id,returned_at);

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['supplier_returns','supplier_return_lines'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id=current_setting(''app.tenant_id'',true)::uuid) WITH CHECK (tenant_id=current_setting(''app.tenant_id'',true)::uuid)',table_name);
  END LOOP;
END $$;
