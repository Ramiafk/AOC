ALTER TABLE vehicle_auction_bids
  ADD CONSTRAINT vehicle_auction_bids_winner_identity_uk
  UNIQUE(tenant_id,auction_id,id,bidder_customer_id);

ALTER TABLE vehicle_auctions
  ADD CONSTRAINT vehicle_auction_winner_identity_fk
  FOREIGN KEY(tenant_id,id,winning_bid_id,winner_customer_id)
  REFERENCES vehicle_auction_bids(tenant_id,auction_id,id,bidder_customer_id)
  DEFERRABLE INITIALLY DEFERRED;
