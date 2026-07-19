import type { RequestContext, TenantId } from "../../core/src/identity.ts";
import type { MembershipProps } from "./access-control.ts";
import type { InvitationProps } from "./invitation.ts";
import type { MembershipManagementRepository } from "./manage-memberships.ts";
import type { MembershipReader } from "../../../apps/api/src/route-authorizer.ts";

export class InMemoryMembershipRepository implements MembershipManagementRepository, MembershipReader {
  readonly invitations = new Map<string, Readonly<InvitationProps>>();
  readonly memberships: Readonly<MembershipProps>[] = [];
  constructor(initial: readonly Readonly<MembershipProps>[] = []) { (this.memberships as Readonly<MembershipProps>[]).push(...initial); }
  private key(tenantId: TenantId, tokenHash: string): string { return `${tenantId}:${tokenHash}`; }
  async saveInvitation(value: Readonly<InvitationProps>): Promise<void> { this.invitations.set(this.key(value.tenantId, value.tokenHash), value); }
  async findInvitationByTokenHash(tenantId: TenantId, tokenHash: string): Promise<Readonly<InvitationProps> | null> { return this.invitations.get(this.key(tenantId, tokenHash)) ?? null; }
  async acceptInvitation(invitation: Readonly<InvitationProps>, membership: Readonly<MembershipProps>): Promise<void> { this.invitations.set(this.key(invitation.tenantId, invitation.tokenHash), invitation); (this.memberships as Readonly<MembershipProps>[]).push(membership); }
  async findByActor(context: RequestContext): Promise<Readonly<MembershipProps> | null> { return this.memberships.find(value => value.tenantId === context.tenantId && value.userId === context.actorId) ?? null; }
}
