CREATE TABLE service_offerings (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  site_id uuid NOT NULL REFERENCES sites(id),
  activity text NOT NULL,
  name text NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 5 AND 1440),
  buffer_minutes integer NOT NULL CHECK (buffer_minutes BETWEEN 0 AND 240),
  capacity integer NOT NULL CHECK (capacity >= 1),
  price_mode text NOT NULL CHECK (price_mode IN ('fixed', 'from', 'quote')),
  price_cents integer,
  currency char(3) NOT NULL,
  published_channels text[] NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL
);

CREATE TABLE availability_slots (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  offering_id uuid NOT NULL REFERENCES service_offerings(id),
  site_id uuid NOT NULL REFERENCES sites(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  capacity integer NOT NULL CHECK (capacity >= 1),
  booked_count integer NOT NULL DEFAULT 0 CHECK (booked_count >= 0 AND booked_count <= capacity),
  created_at timestamptz NOT NULL,
  CHECK (ends_at > starts_at)
);
CREATE INDEX availability_lookup_idx ON availability_slots (tenant_id, offering_id, starts_at) WHERE booked_count < capacity;

CREATE TABLE bookings (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  site_id uuid NOT NULL REFERENCES sites(id),
  offering_id uuid NOT NULL REFERENCES service_offerings(id),
  slot_id uuid NOT NULL REFERENCES availability_slots(id),
  customer_id uuid NOT NULL REFERENCES customers(id),
  asset_id uuid REFERENCES assets(id),
  channel text NOT NULL,
  acquisition_owner_organization_id uuid REFERENCES organizations(id),
  commission_basis_points integer NOT NULL DEFAULT 0 CHECK (commission_basis_points BETWEEN 0 AND 10000),
  status text NOT NULL CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
  created_at timestamptz NOT NULL,
  cancelled_at timestamptz
);
CREATE INDEX bookings_calendar_idx ON bookings (tenant_id, site_id, created_at);
CREATE INDEX bookings_customer_idx ON bookings (tenant_id, customer_id, created_at DESC);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['service_offerings', 'availability_slots', 'bookings']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', table_name);
  END LOOP;
END $$;
