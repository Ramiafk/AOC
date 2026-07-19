CREATE TABLE membership_invitations (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  email text NOT NULL,
  role text NOT NULL,
  site_ids uuid[] NOT NULL DEFAULT '{}',
  extra_permissions text[] NOT NULL DEFAULT '{}',
  token_hash char(64) NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  accepted_by uuid,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL,
  UNIQUE (tenant_id, token_hash)
);
CREATE INDEX membership_invitations_pending_idx ON membership_invitations (tenant_id, email, expires_at) WHERE status = 'pending';

ALTER TABLE membership_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON membership_invitations
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
