import type { RequestContext } from "../../../packages/core/src/identity.ts";
import type { AccessScope, Permission, MembershipProps } from "../../../packages/organizations/src/access-control.ts";
import { authorize } from "../../../packages/organizations/src/access-control.ts";
import { DomainError } from "../../../packages/core/src/errors.ts";

export interface MembershipReader {
  findByActor(context: RequestContext): Promise<Readonly<MembershipProps> | null>;
}

export class RouteAuthorizer {
  private readonly memberships: MembershipReader;
  constructor(memberships: MembershipReader) { this.memberships = memberships; }

  async require(context: RequestContext, permission: Permission, scope?: AccessScope): Promise<void> {
    const membership = await this.memberships.findByActor(context);
    if (!membership) throw new DomainError("MEMBERSHIP_REQUIRED", "No active membership was found");
    authorize(membership, context.tenantId, permission, scope);
  }
}

export class InMemoryMembershipReader implements MembershipReader {
  private readonly memberships: readonly Readonly<MembershipProps>[];
  constructor(memberships: readonly Readonly<MembershipProps>[]) { this.memberships = memberships; }
  async findByActor(context: RequestContext): Promise<Readonly<MembershipProps> | null> {
    return this.memberships.find(value => value.tenantId === context.tenantId && value.userId === context.actorId) ?? null;
  }
}
