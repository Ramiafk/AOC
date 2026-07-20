ALTER TABLE vehicle_deliveries ADD CONSTRAINT vehicle_deliveries_scope_id_unique UNIQUE(tenant_id,organization_id,site_id,stock_item_id,sale_id,id);

CREATE TABLE vehicle_ownership_transfers(
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL, site_id uuid NOT NULL,
  stock_item_id uuid NOT NULL, sale_id uuid NOT NULL, delivery_id uuid NOT NULL, asset_id uuid NOT NULL,
  previous_owner_customer_id uuid NOT NULL, new_owner_customer_id uuid NOT NULL, evidence_hash char(64) NOT NULL,
  transferred_by uuid NOT NULL, transferred_at timestamptz NOT NULL,
  UNIQUE(tenant_id,id), UNIQUE(tenant_id,stock_item_id),
  CHECK(previous_owner_customer_id<>new_owner_customer_id),
  CONSTRAINT ownership_transfer_delivery_scope_fk FOREIGN KEY(tenant_id,organization_id,site_id,stock_item_id,sale_id,delivery_id) REFERENCES vehicle_deliveries(tenant_id,organization_id,site_id,stock_item_id,sale_id,id),
  CONSTRAINT ownership_transfer_asset_fk FOREIGN KEY(tenant_id,asset_id) REFERENCES assets(tenant_id,id),
  CONSTRAINT ownership_transfer_previous_owner_fk FOREIGN KEY(tenant_id,previous_owner_customer_id) REFERENCES customers(tenant_id,id),
  CONSTRAINT ownership_transfer_new_owner_fk FOREIGN KEY(tenant_id,new_owner_customer_id) REFERENCES customers(tenant_id,id)
);

CREATE TABLE vehicle_transfer_documents(
  tenant_id uuid NOT NULL, transfer_id uuid NOT NULL, document_id uuid NOT NULL,
  PRIMARY KEY(tenant_id,transfer_id,document_id),
  CONSTRAINT transfer_documents_transfer_fk FOREIGN KEY(tenant_id,transfer_id) REFERENCES vehicle_ownership_transfers(tenant_id,id),
  CONSTRAINT transfer_documents_document_fk FOREIGN KEY(tenant_id,document_id) REFERENCES documents(tenant_id,id)
);

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['vehicle_ownership_transfers','vehicle_transfer_documents'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id=current_setting(''app.tenant_id'',true)::uuid) WITH CHECK (tenant_id=current_setting(''app.tenant_id'',true)::uuid)',table_name);
  END LOOP;
END $$;
