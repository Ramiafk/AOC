import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { invariant } from "../../core/src/errors.ts";
import { newEntityId, type EntityId, type TenantScoped } from "../../core/src/identity.ts";
import type { Permission, RoleKey } from "./access-control.ts";

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export interface InvitationProps extends TenantScoped {
  id: EntityId;
  organizationId: EntityId;
  email: string;
  role: RoleKey;
  siteIds: readonly EntityId[];
  extraPermissions: readonly Permission[];
  tokenHash: string;
  status: InvitationStatus;
  invitedBy: EntityId;
  expiresAt: string;
  acceptedBy?: EntityId | undefined;
  acceptedAt?: string | undefined;
  createdAt: string;
}

export interface IssuedInvitation { invitation: Invitation; token: string }

export class Invitation {
  private props: InvitationProps;
  private constructor(props: InvitationProps) { this.props = props; }

  static issue(input: Omit<InvitationProps, "id" | "tokenHash" | "status" | "expiresAt" | "createdAt" | "acceptedBy" | "acceptedAt">, now = new Date(), ttlHours = 72): IssuedInvitation {
    invariant(/^\S+@\S+\.\S+$/.test(input.email), "INVALID_INVITATION_EMAIL", "A valid email is required");
    invariant(input.role === "owner" || input.siteIds.length > 0, "SITE_SCOPE_REQUIRED", "Non-owner invitations need a site scope");
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(now.getTime() + ttlHours * 3_600_000).toISOString();
    return { token, invitation: new Invitation({ ...input, id: newEntityId(), email: input.email.trim().toLowerCase(), siteIds: Object.freeze([...new Set(input.siteIds)]), extraPermissions: Object.freeze([...new Set(input.extraPermissions)]), tokenHash: Invitation.hash(token), status: "pending", expiresAt, createdAt: now.toISOString() }) };
  }

  static restore(props: InvitationProps): Invitation { return new Invitation(props); }
  static hash(token: string): string { return createHash("sha256").update(token).digest("hex"); }

  accept(input: { token: string; actorId: EntityId; verifiedEmail: string; now?: Date }): void {
    const now = input.now ?? new Date();
    invariant(this.props.status === "pending", "INVITATION_NOT_PENDING", "Invitation cannot be used");
    invariant(now < new Date(this.props.expiresAt), "INVITATION_EXPIRED", "Invitation has expired");
    invariant(input.verifiedEmail.trim().toLowerCase() === this.props.email, "INVITATION_EMAIL_MISMATCH", "Invitation belongs to another identity");
    const provided = Buffer.from(Invitation.hash(input.token), "hex");
    const expected = Buffer.from(this.props.tokenHash, "hex");
    invariant(provided.length === expected.length && timingSafeEqual(provided, expected), "INVALID_INVITATION_TOKEN", "Invitation token is invalid");
    this.props = { ...this.props, status: "accepted", acceptedBy: input.actorId, acceptedAt: now.toISOString() };
  }

  snapshot(): Readonly<InvitationProps> { return this.props; }
}
