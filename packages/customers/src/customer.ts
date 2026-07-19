import { invariant } from "../../core/src/errors.ts";
import { newEntityId, type EntityId, type TenantScoped } from "../../core/src/identity.ts";

export type CustomerKind = "individual" | "business";
export type AcquisitionChannel = "central_marketplace" | "professional_app" | "professional_website" | "staff" | "partner" | "api";

export interface CustomerProps extends TenantScoped {
  id: EntityId;
  kind: CustomerKind;
  displayName: string;
  email?: string | undefined;
  phone?: string | undefined;
  acquisitionChannel: AcquisitionChannel;
  acquisitionOwnerOrganizationId?: EntityId | undefined;
  createdAt: string;
}

export class Customer {
  private readonly props: CustomerProps;
  private constructor(props: CustomerProps) { this.props = props; }

  static create(input: Omit<CustomerProps, "id" | "createdAt">, now = new Date()): Customer {
    invariant(input.displayName.trim().length >= 2, "CUSTOMER_NAME_REQUIRED", "Customer name is required");
    invariant(Boolean(input.email || input.phone), "CUSTOMER_CONTACT_REQUIRED", "Email or phone is required");
    invariant(input.acquisitionChannel === "central_marketplace" || Boolean(input.acquisitionOwnerOrganizationId), "ACQUISITION_OWNER_REQUIRED", "Direct channels require an owning organization");
    return new Customer({ ...input, id: newEntityId(), displayName: input.displayName.trim(), email: input.email?.trim().toLowerCase(), createdAt: now.toISOString() });
  }

  snapshot(): Readonly<CustomerProps> { return this.props; }
}
