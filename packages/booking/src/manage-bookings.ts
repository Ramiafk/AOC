import { invariant } from "../../core/src/errors.ts";
import type { DomainEvent } from "../../core/src/events.ts";
import { newEntityId, type EntityId, type RequestContext, type TenantId } from "../../core/src/identity.ts";
import { AvailabilitySlot, Booking, ServiceOffering, commissionFor, type AvailabilitySlotProps, type BookingChannel, type BookingProps, type ServiceOfferingProps } from "./booking.ts";

export interface BookingRepository {
  saveOffering(value: Readonly<ServiceOfferingProps>): Promise<void>;
  findOffering(tenantId: TenantId, id: EntityId): Promise<Readonly<ServiceOfferingProps> | null>;
  saveSlot(value: Readonly<AvailabilitySlotProps>): Promise<void>;
  findSlot(tenantId: TenantId, id: EntityId): Promise<Readonly<AvailabilitySlotProps> | null>;
  reserve(slot: Readonly<AvailabilitySlotProps>, booking: Readonly<BookingProps>, event: DomainEvent): Promise<void>;
  cancel(slot: Readonly<AvailabilitySlotProps>, booking: Readonly<BookingProps>, event: DomainEvent): Promise<void>;
  findBooking(tenantId: TenantId, id: EntityId): Promise<Readonly<BookingProps> | null>;
}

export class ManageBookings {
  private readonly repository: BookingRepository;
  private readonly now: () => Date;
  constructor(repository: BookingRepository, now = () => new Date()) { this.repository = repository; this.now = now; }

  async createOffering(context: RequestContext, input: Omit<ServiceOfferingProps, "id" | "tenantId" | "createdAt" | "active">): Promise<Readonly<ServiceOfferingProps>> {
    const offering = ServiceOffering.create({ ...input, tenantId: context.tenantId }, this.now()).snapshot();
    await this.repository.saveOffering(offering);
    return offering;
  }

  async createSlot(context: RequestContext, input: { offeringId: EntityId; startsAt: string; capacity?: number | undefined }): Promise<Readonly<AvailabilitySlotProps>> {
    const offering = await this.repository.findOffering(context.tenantId, input.offeringId);
    invariant(offering !== null, "OFFERING_NOT_FOUND", "Service offering was not found");
    invariant(offering.active, "OFFERING_NOT_FOUND", "Service offering was not found");
    const starts = new Date(input.startsAt);
    const ends = new Date(starts.getTime() + (offering.durationMinutes + offering.bufferMinutes) * 60_000);
    const slot = AvailabilitySlot.create({ tenantId: context.tenantId, offeringId: offering.id, siteId: offering.siteId, startsAt: starts.toISOString(), endsAt: ends.toISOString(), capacity: input.capacity ?? offering.capacity }, this.now()).snapshot();
    await this.repository.saveSlot(slot);
    return slot;
  }

  async book(context: RequestContext, input: { slotId: EntityId; customerId: EntityId; assetId?: EntityId | undefined; channel: BookingChannel; acquisitionOwnerOrganizationId?: EntityId | undefined; marketplaceCommissionBasisPoints?: number | undefined }): Promise<Readonly<BookingProps>> {
    const storedSlot = await this.repository.findSlot(context.tenantId, input.slotId);
    invariant(storedSlot, "SLOT_NOT_FOUND", "Availability slot was not found");
    const offering = await this.repository.findOffering(context.tenantId, storedSlot.offeringId);
    invariant(offering !== null, "OFFERING_NOT_FOUND", "Service offering was not found");
    invariant(offering.publishedChannels.includes(input.channel), "CHANNEL_NOT_PUBLISHED", "Service is not published on this channel");
    const slot = AvailabilitySlot.restore({ ...storedSlot }); slot.reserve();
    const booking = Booking.create({ tenantId: context.tenantId, organizationId: offering.organizationId, siteId: offering.siteId, offeringId: offering.id, slotId: storedSlot.id, customerId: input.customerId, assetId: input.assetId, channel: input.channel, acquisitionOwnerOrganizationId: input.acquisitionOwnerOrganizationId, commissionBasisPoints: commissionFor(input.channel, input.marketplaceCommissionBasisPoints ?? 0) }, this.now()).snapshot();
    await this.repository.reserve(slot.snapshot(), booking, { id: newEntityId(), tenantId: context.tenantId, aggregateId: booking.id, type: "booking.confirmed.v1", occurredAt: this.now().toISOString(), payload: { channel: booking.channel, siteId: booking.siteId } });
    return booking;
  }

  async cancel(context: RequestContext, bookingId: EntityId): Promise<Readonly<BookingProps>> {
    const storedBooking = await this.repository.findBooking(context.tenantId, bookingId);
    invariant(storedBooking, "BOOKING_NOT_FOUND", "Booking was not found");
    const storedSlot = await this.repository.findSlot(context.tenantId, storedBooking.slotId);
    invariant(storedSlot, "SLOT_NOT_FOUND", "Availability slot was not found");
    const slot = AvailabilitySlot.restore({ ...storedSlot }); slot.release();
    const booking = Booking.restore({ ...storedBooking }); booking.cancel(this.now());
    await this.repository.cancel(slot.snapshot(), booking.snapshot(), { id: newEntityId(), tenantId: context.tenantId, aggregateId: bookingId, type: "booking.cancelled.v1", occurredAt: this.now().toISOString(), payload: { siteId: booking.snapshot().siteId } });
    return booking.snapshot();
  }
}
