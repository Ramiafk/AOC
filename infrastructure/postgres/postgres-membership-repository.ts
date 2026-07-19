import type { Pool, PoolClient } from "pg";
import { DomainError } from "../../packages/core/src/errors.ts";
import type { RequestContext, TenantId } from "../../packages/core/src/identity.ts";
import type { MembershipProps } from "../../packages/organizations/src/access-control.ts";
import type { InvitationProps } from "../../packages/organizations/src/invitation.ts";
import type { MembershipManagementRepository } from "../../packages/organizations/src/manage-memberships.ts";
import type { MembershipReader } from "../../apps/api/src/route-authorizer.ts";

export class PostgresMembershipRepository implements MembershipManagementRepository, MembershipReader {
  private readonly pool: Pool;
  constructor(pool: Pool) { this.pool = pool; }

  private async transaction<T>(tenantId: TenantId, operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }

  async saveInvitation(value: Readonly<InvitationProps>): Promise<void> {
    await this.transaction(value.tenantId, client => client.query(
      `INSERT INTO membership_invitations (id, tenant_id, organization_id, email, role, site_ids, extra_permissions, token_hash, status, invited_by, expires_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [value.id, value.tenantId, value.organizationId, value.email, value.role, value.siteIds, value.extraPermissions, value.tokenHash, value.status, value.invitedBy, value.expiresAt, value.createdAt]
    ).then(() => undefined));
  }

  async findInvitationByTokenHash(tenantId: TenantId, tokenHash: string): Promise<Readonly<InvitationProps> | null> {
    return this.transaction(tenantId, async client => {
      const result = await client.query("SELECT * FROM membership_invitations WHERE token_hash = $1", [tokenHash]);
      const row = result.rows[0];
      return row ? this.mapInvitation(row) : null;
    });
  }

  async acceptInvitation(invitation: Readonly<InvitationProps>, membership: Readonly<MembershipProps>): Promise<void> {
    await this.transaction(invitation.tenantId, async client => {
      const updated = await client.query(
        `UPDATE membership_invitations SET status = 'accepted', accepted_by = $1, accepted_at = $2
         WHERE id = $3 AND status = 'pending'`,
        [invitation.acceptedBy, invitation.acceptedAt, invitation.id]
      );
      if (updated.rowCount !== 1) throw new DomainError("INVITATION_ALREADY_CONSUMED", "Invitation was already consumed");
      await client.query(
        `INSERT INTO memberships (id, tenant_id, organization_id, user_id, role, site_ids, extra_permissions, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [membership.id, membership.tenantId, membership.organizationId, membership.userId, membership.role, membership.siteIds, membership.extraPermissions, membership.createdAt]
      );
    });
  }

  async findByActor(context: RequestContext): Promise<Readonly<MembershipProps> | null> {
    return this.transaction(context.tenantId, async client => {
      const result = await client.query("SELECT * FROM memberships WHERE user_id = $1 ORDER BY created_at LIMIT 1", [context.actorId]);
      const row = result.rows[0];
      return row ? { id: row.id, tenantId: row.tenant_id, organizationId: row.organization_id, userId: row.user_id, role: row.role, siteIds: row.site_ids, extraPermissions: row.extra_permissions, createdAt: row.created_at.toISOString() } as MembershipProps : null;
    });
  }

  private mapInvitation(row: Record<string, any>): InvitationProps {
    return { id: row.id, tenantId: row.tenant_id, organizationId: row.organization_id, email: row.email, role: row.role, siteIds: row.site_ids, extraPermissions: row.extra_permissions, tokenHash: row.token_hash, status: row.status, invitedBy: row.invited_by, expiresAt: row.expires_at.toISOString(), acceptedBy: row.accepted_by ?? undefined, acceptedAt: row.accepted_at?.toISOString(), createdAt: row.created_at.toISOString() } as InvitationProps;
  }
}
