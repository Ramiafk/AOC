import { invariant } from "../../core/src/errors.ts";
import { newEntityId, type EntityId, type TenantScoped } from "../../core/src/identity.ts";
import type { AcquisitionChannel } from "../../customers/src/customer.ts";

export type BookingChannel = AcquisitionChannel;
export type BookingStatus = "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
export type PriceMode = "fixed" | "from" | "quote";

export interface ServiceOfferingProps extends TenantScoped {
  id: EntityId;
  organizationId: EntityId;
  siteId: EntityId;
  activity: string;
  name: string;
  durationMinutes: number;
  bufferMinutes: number;
  capacity: number;
  priceMode: PriceMode;
  priceCents?: number | undefined;
  currency: string;
  publishedChannels: readonly BookingChannel[];
  active: boolean;
  createdAt: string;
}

export class ServiceOffering {
  private readonly props: ServiceOfferingProps;
  private constructor(props: ServiceOfferingProps) { this.props = props; }
  static create(input: Omit<ServiceOfferingProps, "id" | "createdAt" | "active">, now = new Date()): ServiceOffering {
    invariant(input.name.trim().length >= 2, "SERVICE_NAME_REQUIRED", "Service name is required");
    invariant(input.durationMinutes >= 5 && input.durationMinutes <= 1440, "INVALID_SERVICE_DURATION", "Service duration must be between 5 and 1440 minutes");
    invariant(input.bufferMinutes >= 0 && input.bufferMinutes <= 240, "INVALID_SERVICE_BUFFER", "Service buffer is invalid");
    invariant(Number.isInteger(input.capacity) && input.capacity >= 1, "INVALID_SERVICE_CAPACITY", "Service capacity must be at least one");
    invariant(input.priceMode === "quote" || (input.priceCents !== undefined && input.priceCents >= 0), "SERVICE_PRICE_REQUIRED", "Fixed and from prices require an amount");
    invariant(/^[A-Z]{3}$/.test(input.currency), "INVALID_CURRENCY", "Currency must use ISO 4217");
    return new ServiceOffering({ ...input, id: newEntityId(), name: input.name.trim(), publishedChannels: Object.freeze([...new Set(input.publishedChannels)]), active: true, createdAt: now.toISOString() });
  }
  snapshot(): Readonly<ServiceOfferingProps> { return this.props; }
}

export interface AvailabilitySlotProps extends TenantScoped {
  id: EntityId;
  offeringId: EntityId;
  siteId: EntityId;
  startsAt: string;
  endsAt: string;
  capacity: number;
  bookedCount: number;
  createdAt: string;
}

export class AvailabilitySlot {
  private props: AvailabilitySlotProps;
  private constructor(props: AvailabilitySlotProps) { this.props = props; }
  static create(input: Omit<AvailabilitySlotProps, "id" | "bookedCount" | "createdAt">, now = new Date()): AvailabilitySlot {
    invariant(new Date(input.startsAt) < new Date(input.endsAt), "INVALID_SLOT_RANGE", "Slot end must be after its start");
    invariant(new Date(input.startsAt) > now, "SLOT_MUST_BE_FUTURE", "Availability must be in the future");
    invariant(input.capacity >= 1, "INVALID_SLOT_CAPACITY", "Slot capacity must be positive");
    return new AvailabilitySlot({ ...input, id: newEntityId(), bookedCount: 0, createdAt: now.toISOString() });
  }
  static restore(props: AvailabilitySlotProps): AvailabilitySlot { return new AvailabilitySlot(props); }
  reserve(): void { invariant(this.props.bookedCount < this.props.capacity, "SLOT_FULL", "This slot is no longer available"); this.props = { ...this.props, bookedCount: this.props.bookedCount + 1 }; }
  release(): void { invariant(this.props.bookedCount > 0, "SLOT_NOT_RESERVED", "Slot has no reservation to release"); this.props = { ...this.props, bookedCount: this.props.bookedCount - 1 }; }
  snapshot(): Readonly<AvailabilitySlotProps> { return this.props; }
}

export interface BookingProps extends TenantScoped {
  id: EntityId;
  organizationId: EntityId;
  siteId: EntityId;
  offeringId: EntityId;
  slotId: EntityId;
  customerId: EntityId;
  assetId?: EntityId | undefined;
  channel: BookingChannel;
  acquisitionOwnerOrganizationId?: EntityId | undefined;
  commissionBasisPoints: number;
  status: BookingStatus;
  createdAt: string;
  cancelledAt?: string | undefined;
}

export class Booking {
  private props: BookingProps;
  private constructor(props: BookingProps) { this.props = props; }
  static create(input: Omit<BookingProps, "id" | "status" | "createdAt" | "cancelledAt">, now = new Date()): Booking {
    invariant(input.commissionBasisPoints >= 0 && input.commissionBasisPoints <= 10_000, "INVALID_COMMISSION", "Commission rate is invalid");
    invariant(input.channel === "central_marketplace" || Boolean(input.acquisitionOwnerOrganizationId), "BOOKING_ATTRIBUTION_REQUIRED", "Direct bookings require an owning organization");
    invariant(input.channel !== "central_marketplace" || input.commissionBasisPoints >= 0, "INVALID_MARKETPLACE_COMMISSION", "Marketplace commission is invalid");
    return new Booking({ ...input, id: newEntityId(), status: "confirmed", createdAt: now.toISOString() });
  }
  static restore(props: BookingProps): Booking { return new Booking(props); }
  cancel(now = new Date()): void { invariant(this.props.status === "confirmed" || this.props.status === "pending", "BOOKING_NOT_CANCELLABLE", "Booking cannot be cancelled"); this.props = { ...this.props, status: "cancelled", cancelledAt: now.toISOString() }; }
  snapshot(): Readonly<BookingProps> { return this.props; }
}

export function commissionFor(channel: BookingChannel, marketplaceBasisPoints: number): number {
  return channel === "central_marketplace" ? marketplaceBasisPoints : 0;
}
