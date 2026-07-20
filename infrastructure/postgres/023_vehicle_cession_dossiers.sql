ALTER TABLE vehicle_ownership_transfers
  ADD CONSTRAINT ownership_transfers_scope_id_unique
  UNIQUE(tenant_id,organization_id,site_id,stock_item_id,id,asset_id,new_owner_customer_id);

CREATE UNIQUE INDEX IF NOT EXISTS documents_tenant_asset_owner_id_uidx
  ON documents(tenant_id,id,asset_id,owner_customer_id);

CREATE TABLE vehicle_cession_dossiers(
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  organization_id uuid NOT NULL,
  site_id uuid NOT NULL,
  stock_item_id uuid NOT NULL,
  transfer_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  certificate_document_id uuid NOT NULL,
  delivery_receipt_document_id uuid NOT NULL,
  issued_by uuid NOT NULL,
  issued_at timestamptz NOT NULL,
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,stock_item_id),
  CHECK(certificate_document_id<>delivery_receipt_document_id),
  CONSTRAINT cession_dossier_transfer_scope_fk FOREIGN KEY(tenant_id,organization_id,site_id,stock_item_id,transfer_id,asset_id,customer_id) REFERENCES vehicle_ownership_transfers(tenant_id,organization_id,site_id,stock_item_id,id,asset_id,new_owner_customer_id),
  CONSTRAINT cession_dossier_asset_fk FOREIGN KEY(tenant_id,asset_id) REFERENCES assets(tenant_id,id),
  CONSTRAINT cession_dossier_customer_fk FOREIGN KEY(tenant_id,customer_id) REFERENCES customers(tenant_id,id),
  CONSTRAINT cession_dossier_certificate_fk FOREIGN KEY(tenant_id,certificate_document_id,asset_id,customer_id) REFERENCES documents(tenant_id,id,asset_id,owner_customer_id),
  CONSTRAINT cession_dossier_receipt_fk FOREIGN KEY(tenant_id,delivery_receipt_document_id,asset_id,customer_id) REFERENCES documents(tenant_id,id,asset_id,owner_customer_id)
);

CREATE INDEX vehicle_cession_dossiers_customer_idx ON vehicle_cession_dossiers(tenant_id,customer_id,issued_at DESC);
ALTER TABLE vehicle_cession_dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_cession_dossiers FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON vehicle_cession_dossiers USING(tenant_id=current_setting('app.tenant_id',true)::uuid) WITH CHECK(tenant_id=current_setting('app.tenant_id',true)::uuid);
