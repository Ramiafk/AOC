import test from "node:test";
import assert from "node:assert/strict";
import { DomainError } from "../../core/src/errors.ts";
import { newEntityId, tenantId } from "../../core/src/identity.ts";
import { Customer } from "../src/customer.ts";

test("preserves ownership of a customer acquired on a professional channel", () => {
  const organizationId = newEntityId();
  const customer = Customer.create({ tenantId: tenantId("11111111-1111-4111-8111-111111111111"), kind: "individual", displayName: "Client direct", email: "CLIENT@example.com", acquisitionChannel: "professional_website", acquisitionOwnerOrganizationId: organizationId }).snapshot();
  assert.equal(customer.acquisitionOwnerOrganizationId, organizationId);
  assert.equal(customer.email, "client@example.com");
});

test("rejects a direct acquisition without owning professional", () => {
  assert.throws(() => Customer.create({ tenantId: tenantId("11111111-1111-4111-8111-111111111111"), kind: "individual", displayName: "Client direct", phone: "+33600000000", acquisitionChannel: "professional_app" }), (error: unknown) => error instanceof DomainError && error.code === "ACQUISITION_OWNER_REQUIRED");
});
