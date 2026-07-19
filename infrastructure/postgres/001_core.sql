CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organizations (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  legal_name text NOT NULL,
  display_name text NOT NULL,
  country_code char(2) NOT NULL,
  activities text[] NOT NULL CHECK (cardinality(activities) > 0),
  created_at timestamptz NOT NULL
);

CREATE TABLE sites (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  country_code char(2) NOT NULL,
  timezone text NOT NULL,
  activities text[] NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (tenant_id, id)
);

CREATE TABLE memberships (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  user_id uuid NOT NULL,
  role text NOT NULL,
  site_ids uuid[] NOT NULL DEFAULT '{}',
  extra_permissions text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL,
  UNIQUE (tenant_id, organization_id, user_id)
);

CREATE TABLE customers (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  kind text NOT NULL CHECK (kind IN ('individual', 'business')),
  display_name text NOT NULL,
  email text,
  phone text,
  acquisition_channel text NOT NULL,
  acquisition_owner_organization_id uuid REFERENCES organizations(id),
  created_at timestamptz NOT NULL,
  CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE TABLE audit_entries (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  actor_id uuid NOT NULL,
  correlation_id text NOT NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid NOT NULL,
  site_id uuid,
  occurred_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE assets (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  owner_customer_id uuid NOT NULL REFERENCES customers(id),
  kind text NOT NULL,
  registration text,
  vin_or_serial text,
  manufacturer text,
  model text,
  first_registration_at date,
  attributes jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL,
  CHECK (registration IS NOT NULL OR vin_or_serial IS NOT NULL)
);
CREATE INDEX assets_tenant_owner_idx ON assets (tenant_id, owner_customer_id);
CREATE UNIQUE INDEX assets_tenant_vin_idx ON assets (tenant_id, vin_or_serial) WHERE vin_or_serial IS NOT NULL;

CREATE TABLE outbox_events (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  aggregate_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  published_at timestamptz
);
CREATE INDEX outbox_unpublished_idx ON outbox_events (occurred_at) WHERE published_at IS NULL;

ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_assets ON assets
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['organizations', 'sites', 'memberships', 'customers', 'audit_entries', 'outbox_events']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true)::uuid)', table_name);
  END LOOP;
END $$;
