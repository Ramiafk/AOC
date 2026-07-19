import { invariant } from "../../core/src/errors.ts";
import type { EntityId, RequestContext, TenantId } from "../../core/src/identity.ts";
import { Membership, type MembershipProps, type Permission, type RoleKey } from "./access-control.ts";
import { Invitation, type InvitationProps } from "./invitation.ts";

export interface MembershipManagementRepository {
  saveInvitation(value: Readonly<InvitationProps>): Promise<void>;
  findInvitationByTokenHash(tenantId: TenantId, tokenHash: string): Promise<Readonly<InvitationProps> | null>;
  acceptInvitation(invitation: Readonly<InvitationProps>, membership: Readonly<MembershipProps>): Promise<void>;
}

export interface InvitationNotifier { send(input: { email: string; token: string; expiresAt: string }): Promise<void> }

export class ManageMemberships {
  private readonly repository: MembershipManagementRepository;
  private readonly notifier: InvitationNotifier;
  private readonly now: () => Date;
  constructor(repository: MembershipManagementRepository, notifier: InvitationNotifier, now = () => new Date()) { this.repository = repository; this.notifier = notifier; this.now = now; }

  async invite(context: RequestContext, input: { organizationId: EntityId; email: string; role: RoleKey; siteIds: EntityId[]; extraPermissions?: Permission[] | undefined }): Promise<Readonly<InvitationProps>> {
    const issued = Invitation.issue({ tenantId: context.tenantId, organizationId: input.organizationId, email: input.email, role: input.role, siteIds: input.siteIds, extraPermissions: input.extraPermissions ?? [], invitedBy: context.actorId }, this.now());
    await this.repository.saveInvitation(issued.invitation.snapshot());
    await this.notifier.send({ email: issued.invitation.snapshot().email, token: issued.token, expiresAt: issued.invitation.snapshot().expiresAt });
    return issued.invitation.snapshot();
  }

  async accept(context: RequestContext, token: string): Promise<Readonly<MembershipProps>> {
    invariant(Boolean(context.verifiedEmail), "VERIFIED_EMAIL_REQUIRED", "A verified email claim is required");
    const stored = await this.repository.findInvitationByTokenHash(context.tenantId, Invitation.hash(token));
    invariant(stored, "INVITATION_NOT_FOUND", "Invitation was not found");
    const invitation = Invitation.restore({ ...stored });
    invitation.accept({ token, actorId: context.actorId, verifiedEmail: context.verifiedEmail!, now: this.now() });
    const accepted = invitation.snapshot();
    const membership = Membership.create({ tenantId: accepted.tenantId, organizationId: accepted.organizationId, userId: context.actorId, role: accepted.role, siteIds: accepted.siteIds, extraPermissions: accepted.extraPermissions }, this.now()).snapshot();
    await this.repository.acceptInvitation(accepted, membership);
    return membership;
  }
}

export class InMemoryInvitationNotifier implements InvitationNotifier {
  readonly deliveries: { email: string; token: string; expiresAt: string }[] = [];
  async send(input: { email: string; token: string; expiresAt: string }): Promise<void> { this.deliveries.push(input); }
}
