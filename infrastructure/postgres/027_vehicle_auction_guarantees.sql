ALTER TABLE vehicle_auctions
  ADD COLUMN guarantee_amount_cents integer NOT NULL DEFAULT 50000 CHECK(guarantee_amount_cents>0),
  ADD COLUMN currency character(3) NOT NULL DEFAULT 'EUR' CHECK(currency~'^[A-Z]{3}$'),
  ADD COLUMN guarantee_required boolean NOT NULL DEFAULT false;

ALTER TABLE vehicle_auctions
  ADD CONSTRAINT vehicle_auctions_guarantee_scope_unique
    UNIQUE(tenant_id,organization_id,site_id,stock_item_id,id,guarantee_amount_cents,currency),
  ADD CONSTRAINT vehicle_auctions_guarantee_mode_unique
    UNIQUE(tenant_id,id,guarantee_required);

-- Existing 5H auctions remain explicitly legacy. Only auctions created after 027
-- require a provider-backed guarantee.
ALTER TABLE vehicle_auctions ALTER COLUMN guarantee_required SET DEFAULT true;

CREATE TABLE vehicle_auction_guarantees(
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  organization_id uuid NOT NULL,
  site_id uuid NOT NULL,
  auction_id uuid NOT NULL,
  stock_item_id uuid NOT NULL,
  bidder_customer_id uuid NOT NULL,
  provider text NOT NULL CHECK(length(trim(provider))>0),
  provider_reference text NOT NULL CHECK(length(trim(provider_reference))>0),
  idempotency_key text NOT NULL CHECK(length(trim(idempotency_key))>=3),
  amount_cents integer NOT NULL CHECK(amount_cents>0),
  currency character(3) NOT NULL CHECK(currency~'^[A-Z]{3}$'),
  status text NOT NULL CHECK(status IN('authorized','captured','released')),
  authorized_at timestamptz NOT NULL,
  closed_at timestamptz,
  closed_reason text CHECK(closed_reason IN('winner','lost','unsold','direct_sale','withdrawn')),
  UNIQUE(tenant_id,id),
  UNIQUE(tenant_id,auction_id,id,bidder_customer_id),
  UNIQUE(tenant_id,idempotency_key),
  UNIQUE(tenant_id,provider,provider_reference),
  CONSTRAINT vehicle_auction_guarantee_scope_fk
    FOREIGN KEY(tenant_id,organization_id,site_id,stock_item_id,auction_id,amount_cents,currency)
    REFERENCES vehicle_auctions(tenant_id,organization_id,site_id,stock_item_id,id,guarantee_amount_cents,currency),
  CONSTRAINT vehicle_auction_guarantee_bidder_fk FOREIGN KEY(tenant_id,bidder_customer_id) REFERENCES customers(tenant_id,id),
  CONSTRAINT vehicle_auction_guarantee_lifecycle_check CHECK(
    (status='authorized' AND closed_at IS NULL AND closed_reason IS NULL) OR
    (status='captured' AND closed_at IS NOT NULL AND closed_reason='winner') OR
    (status='released' AND closed_at IS NOT NULL AND closed_reason IN('lost','unsold','direct_sale','withdrawn'))
  )
);

CREATE UNIQUE INDEX vehicle_auction_guarantees_one_active_uidx ON vehicle_auction_guarantees(tenant_id,auction_id,bidder_customer_id) WHERE status='authorized';
CREATE INDEX vehicle_auction_guarantees_scope_idx ON vehicle_auction_guarantees(tenant_id,organization_id,site_id,auction_id,status);

ALTER TABLE vehicle_auction_bids
  ADD COLUMN guarantee_id uuid,
  ADD COLUMN guarantee_required boolean NOT NULL DEFAULT false;

-- Historical 5H bids keep a NULL guarantee and remain readable/closable. New
-- writes inherit true and must reference a genuine authorized guarantee.
ALTER TABLE vehicle_auction_bids ALTER COLUMN guarantee_required SET DEFAULT true;
ALTER TABLE vehicle_auction_bids
  ADD CONSTRAINT vehicle_auction_bid_guarantee_presence_check CHECK(
    (NOT guarantee_required AND guarantee_id IS NULL) OR
    (guarantee_required AND guarantee_id IS NOT NULL)
  ),
  ADD CONSTRAINT vehicle_auction_bid_guarantee_mode_fk
    FOREIGN KEY(tenant_id,auction_id,guarantee_required)
    REFERENCES vehicle_auctions(tenant_id,id,guarantee_required),
  ADD CONSTRAINT vehicle_auction_bid_guarantee_fk
    FOREIGN KEY(tenant_id,auction_id,guarantee_id,bidder_customer_id)
    REFERENCES vehicle_auction_guarantees(tenant_id,auction_id,id,bidder_customer_id);

ALTER TABLE vehicle_auction_guarantees ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_auction_guarantees FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON vehicle_auction_guarantees
  USING(tenant_id=current_setting('app.tenant_id',true)::uuid)
  WITH CHECK(tenant_id=current_setting('app.tenant_id',true)::uuid);
