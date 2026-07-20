CREATE TABLE vehicle_auctions(
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  organization_id uuid NOT NULL,
  site_id uuid NOT NULL,
  stock_item_id uuid NOT NULL,
  channel text NOT NULL CHECK(channel IN('professional_website','professional_app','central_marketplace')),
  starting_price_cents integer NOT NULL CHECK(starting_price_cents>0),
  reserve_price_cents integer NOT NULL CHECK(reserve_price_cents>=starting_price_cents),
  minimum_increment_cents integer NOT NULL CHECK(minimum_increment_cents>0),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL CHECK(status IN('scheduled','sold','unsold','cancelled')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL,
  winner_customer_id uuid,
  winning_bid_id uuid,
  closed_reason text CHECK(closed_reason IN('reserve_met','reserve_not_met','direct_sale','withdrawn')),
  closed_by uuid,
  closed_at timestamptz,
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,organization_id,site_id,stock_item_id,id),
  CONSTRAINT vehicle_auction_window_check CHECK(ends_at>starts_at),
  CONSTRAINT vehicle_auction_scope_fk FOREIGN KEY(tenant_id,organization_id,site_id,stock_item_id) REFERENCES vehicle_stock_items(tenant_id,organization_id,site_id,id),
  CONSTRAINT vehicle_auction_winner_fk FOREIGN KEY(tenant_id,winner_customer_id) REFERENCES customers(tenant_id,id),
  CONSTRAINT vehicle_auction_closure_check CHECK(
    (status='scheduled' AND winner_customer_id IS NULL AND winning_bid_id IS NULL AND closed_reason IS NULL AND closed_by IS NULL AND closed_at IS NULL) OR
    (status='sold' AND winner_customer_id IS NOT NULL AND winning_bid_id IS NOT NULL AND closed_reason='reserve_met' AND closed_by IS NOT NULL AND closed_at IS NOT NULL) OR
    (status='unsold' AND winner_customer_id IS NULL AND winning_bid_id IS NULL AND closed_reason='reserve_not_met' AND closed_by IS NOT NULL AND closed_at IS NOT NULL) OR
    (status='cancelled' AND winner_customer_id IS NULL AND winning_bid_id IS NULL AND closed_reason IN('direct_sale','withdrawn') AND closed_by IS NOT NULL AND closed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX vehicle_auctions_one_open_uidx ON vehicle_auctions(tenant_id,stock_item_id) WHERE status='scheduled';
CREATE INDEX vehicle_auctions_window_idx ON vehicle_auctions(tenant_id,organization_id,site_id,status,starts_at,ends_at);

CREATE TABLE vehicle_auction_bids(
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  organization_id uuid NOT NULL,
  site_id uuid NOT NULL,
  auction_id uuid NOT NULL,
  stock_item_id uuid NOT NULL,
  bidder_customer_id uuid NOT NULL,
  amount_cents integer NOT NULL CHECK(amount_cents>0),
  placed_at timestamptz NOT NULL,
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,auction_id,id),
  CONSTRAINT vehicle_auction_bid_scope_fk FOREIGN KEY(tenant_id,organization_id,site_id,stock_item_id,auction_id) REFERENCES vehicle_auctions(tenant_id,organization_id,site_id,stock_item_id,id),
  CONSTRAINT vehicle_auction_bidder_fk FOREIGN KEY(tenant_id,bidder_customer_id) REFERENCES customers(tenant_id,id)
);

ALTER TABLE vehicle_auctions
  ADD CONSTRAINT vehicle_auction_winning_bid_fk FOREIGN KEY(tenant_id,id,winning_bid_id) REFERENCES vehicle_auction_bids(tenant_id,auction_id,id) DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX vehicle_auction_bids_rank_idx ON vehicle_auction_bids(tenant_id,auction_id,amount_cents DESC,placed_at,id);

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['vehicle_auctions','vehicle_auction_bids'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id=current_setting(''app.tenant_id'',true)::uuid) WITH CHECK (tenant_id=current_setting(''app.tenant_id'',true)::uuid)',table_name);
  END LOOP;
END $$;
