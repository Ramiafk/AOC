import test from "node:test";
import assert from "node:assert/strict";
import { DomainError } from "../../core/src/errors.ts";
import { newEntityId, tenantId, type RequestContext } from "../../core/src/identity.ts";
import { InMemoryBookingRepository } from "../src/in-memory-booking-repository.ts";
import { ManageBookings } from "../src/manage-bookings.ts";

const context: RequestContext = { tenantId: tenantId("11111111-1111-4111-8111-111111111111"), actorId: newEntityId(), correlationId: "booking-test" };

async function fixture(capacity = 1) {
  const repository = new InMemoryBookingRepository();
  const now = new Date("2026-07-19T20:00:00Z");
  const service = new ManageBookings(repository, () => now);
  const organizationId = newEntityId();
  const offering = await service.createOffering(context, { organizationId, siteId: newEntityId(), activity: "workshop", name: "Révision complète", durationMinutes: 60, bufferMinutes: 15, capacity, priceMode: "from", priceCents: 12900, currency: "EUR", publishedChannels: ["central_marketplace", "professional_website", "professional_app"] });
  const slot = await service.createSlot(context, { offeringId: offering.id, startsAt: "2026-07-21T08:00:00Z" });
  return { repository, service, organizationId, offering, slot };
}

test("books the same service from direct and central channels with correct attribution", async () => {
  const { service, organizationId, slot } = await fixture(2);
  const direct = await service.book(context, { slotId: slot.id, customerId: newEntityId(), channel: "professional_website", acquisitionOwnerOrganizationId: organizationId, marketplaceCommissionBasisPoints: 1200 });
  assert.equal(direct.commissionBasisPoints, 0);
  assert.equal(direct.acquisitionOwnerOrganizationId, organizationId);
  const central = await service.book(context, { slotId: slot.id, customerId: newEntityId(), channel: "central_marketplace", marketplaceCommissionBasisPoints: 1200 });
  assert.equal(central.commissionBasisPoints, 1200);
});

test("prevents overbooking and releases capacity after cancellation", async () => {
  const { repository, service, organizationId, slot } = await fixture();
  const booking = await service.book(context, { slotId: slot.id, customerId: newEntityId(), channel: "professional_app", acquisitionOwnerOrganizationId: organizationId });
  await assert.rejects(() => service.book(context, { slotId: slot.id, customerId: newEntityId(), channel: "professional_app", acquisitionOwnerOrganizationId: organizationId }), (error: unknown) => error instanceof DomainError && error.code === "SLOT_FULL");
  const cancelled = await service.cancel(context, booking.id);
  assert.equal(cancelled.status, "cancelled");
  assert.equal((await repository.findSlot(context.tenantId, slot.id))?.bookedCount, 0);
});

test("refuses booking on a channel where the service is not published", async () => {
  const { service, slot } = await fixture();
  await assert.rejects(() => service.book(context, { slotId: slot.id, customerId: newEntityId(), channel: "partner", acquisitionOwnerOrganizationId: newEntityId() }), (error: unknown) => error instanceof DomainError && error.code === "CHANNEL_NOT_PUBLISHED");
});
