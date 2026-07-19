import test from "node:test";
import assert from "node:assert/strict";
import { DomainError } from "../../core/src/errors.ts";
import { newEntityId, tenantId, type RequestContext } from "../../core/src/identity.ts";
import { InMemoryMembershipRepository } from "../src/in-memory-membership-repository.ts";
import { InMemoryInvitationNotifier, ManageMemberships } from "../src/manage-memberships.ts";

const tenant = tenantId("11111111-1111-4111-8111-111111111111");
const inviter: RequestContext = { tenantId: tenant, actorId: newEntityId(), correlationId: "invite" };

test("invites and creates a scoped membership exactly once", async () => {
  const repository = new InMemoryMembershipRepository();
  const notifier = new InMemoryInvitationNotifier();
  const now = new Date("2026-07-19T20:00:00Z");
  const service = new ManageMemberships(repository, notifier, () => now);
  const siteId = newEntityId();
  const invitation = await service.invite(inviter, { organizationId: newEntityId(), email: "MEMBER@example.com", role: "technician", siteIds: [siteId] });
  assert.equal(invitation.email, "member@example.com");
  assert.equal(notifier.deliveries.length, 1);

  const memberContext: RequestContext = { tenantId: tenant, actorId: newEntityId(), correlationId: "accept", verifiedEmail: "member@example.com" };
  const membership = await service.accept(memberContext, notifier.deliveries[0]!.token);
  assert.equal(membership.role, "technician");
  assert.deepEqual(membership.siteIds, [siteId]);
  await assert.rejects(() => service.accept(memberContext, notifier.deliveries[0]!.token), (error: unknown) => error instanceof DomainError && error.code === "INVITATION_NOT_PENDING");
});

test("rejects another authenticated email and another tenant", async () => {
  const repository = new InMemoryMembershipRepository();
  const notifier = new InMemoryInvitationNotifier();
  const service = new ManageMemberships(repository, notifier, () => new Date("2026-07-19T20:00:00Z"));
  await service.invite(inviter, { organizationId: newEntityId(), email: "right@example.com", role: "viewer", siteIds: [newEntityId()] });
  const token = notifier.deliveries[0]!.token;
  await assert.rejects(() => service.accept({ tenantId: tenant, actorId: newEntityId(), correlationId: "wrong", verifiedEmail: "wrong@example.com" }, token), (error: unknown) => error instanceof DomainError && error.code === "INVITATION_EMAIL_MISMATCH");
  await assert.rejects(() => service.accept({ tenantId: tenantId("22222222-2222-4222-8222-222222222222"), actorId: newEntityId(), correlationId: "other", verifiedEmail: "right@example.com" }, token), (error: unknown) => error instanceof DomainError && error.code === "INVITATION_NOT_FOUND");
});

test("rejects an expired invitation", async () => {
  const repository = new InMemoryMembershipRepository();
  const notifier = new InMemoryInvitationNotifier();
  let now = new Date("2026-07-19T20:00:00Z");
  const service = new ManageMemberships(repository, notifier, () => now);
  await service.invite(inviter, { organizationId: newEntityId(), email: "late@example.com", role: "viewer", siteIds: [newEntityId()] });
  now = new Date("2026-07-23T21:00:00Z");
  await assert.rejects(() => service.accept({ tenantId: tenant, actorId: newEntityId(), correlationId: "late", verifiedEmail: "late@example.com" }, notifier.deliveries[0]!.token), (error: unknown) => error instanceof DomainError && error.code === "INVITATION_EXPIRED");
});
