CREATE UNIQUE INDEX sites_tenant_organization_id_uidx
  ON sites(tenant_id,organization_id,id);

CREATE UNIQUE INDEX vehicle_stock_tenant_scope_id_uidx
  ON vehicle_stock_items(tenant_id,organization_id,site_id,id);

ALTER TABLE vehicle_stock_items
  DROP CONSTRAINT vehicle_stock_tenant_site_fk,
  ADD CONSTRAINT vehicle_stock_tenant_organization_site_fk
    FOREIGN KEY(tenant_id,organization_id,site_id)
    REFERENCES sites(tenant_id,organization_id,id);

ALTER TABLE vehicle_publications
  DROP CONSTRAINT vehicle_publications_tenant_site_fk,
  DROP CONSTRAINT vehicle_publications_tenant_stock_fk,
  ADD CONSTRAINT vehicle_publications_tenant_organization_site_fk
    FOREIGN KEY(tenant_id,organization_id,site_id)
    REFERENCES sites(tenant_id,organization_id,id),
  ADD CONSTRAINT vehicle_publications_tenant_stock_scope_fk
    FOREIGN KEY(tenant_id,organization_id,site_id,stock_item_id)
    REFERENCES vehicle_stock_items(tenant_id,organization_id,site_id,id);
