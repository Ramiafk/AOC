import { DomainError } from "../../core/src/errors.ts";
import type { DomainEvent } from "../../core/src/events.ts";
import type { EntityId, TenantId } from "../../core/src/identity.ts";
import type { AvailabilitySlotProps, BookingProps, ServiceOfferingProps } from "./booking.ts";
import type { BookingRepository } from "./manage-bookings.ts";

export class InMemoryBookingRepository implements BookingRepository {
  readonly offerings = new Map<string, Readonly<ServiceOfferingProps>>();
  readonly slots = new Map<string, Readonly<AvailabilitySlotProps>>();
  readonly bookings = new Map<string, Readonly<BookingProps>>();
  readonly events: DomainEvent[] = [];
  private key(tenantId: TenantId, id: EntityId): string { return `${tenantId}:${id}`; }
  async saveOffering(value: Readonly<ServiceOfferingProps>): Promise<void> { this.offerings.set(this.key(value.tenantId, value.id), value); }
  async findOffering(tenantId: TenantId, id: EntityId): Promise<Readonly<ServiceOfferingProps> | null> { return this.offerings.get(this.key(tenantId, id)) ?? null; }
  async saveSlot(value: Readonly<AvailabilitySlotProps>): Promise<void> { this.slots.set(this.key(value.tenantId, value.id), value); }
  async findSlot(tenantId: TenantId, id: EntityId): Promise<Readonly<AvailabilitySlotProps> | null> { return this.slots.get(this.key(tenantId, id)) ?? null; }
  async findBooking(tenantId: TenantId, id: EntityId): Promise<Readonly<BookingProps> | null> { return this.bookings.get(this.key(tenantId, id)) ?? null; }
  async reserve(slot: Readonly<AvailabilitySlotProps>, booking: Readonly<BookingProps>, event: DomainEvent): Promise<void> {
    const current = this.slots.get(this.key(slot.tenantId, slot.id));
    if (!current || current.bookedCount >= current.capacity) throw new DomainError("SLOT_FULL", "This slot is no longer available");
    this.slots.set(this.key(slot.tenantId, slot.id), slot); this.bookings.set(this.key(booking.tenantId, booking.id), booking); this.events.push(event);
  }
  async cancel(slot: Readonly<AvailabilitySlotProps>, booking: Readonly<BookingProps>, event: DomainEvent): Promise<void> { this.slots.set(this.key(slot.tenantId, slot.id), slot); this.bookings.set(this.key(booking.tenantId, booking.id), booking); this.events.push(event); }
}
