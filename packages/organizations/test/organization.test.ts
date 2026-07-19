import test from "node:test";
import assert from "node:assert/strict";
import { DomainError } from "../../core/src/errors.ts";
import { newEntityId, tenantId } from "../../core/src/identity.ts";
import { Organization, Site } from "../src/organization.ts";
import { Membership, authorize } from "../src/access-control.ts";

const tenant = tenantId("11111111-1111-4111-8111-111111111111");

test("creates a multi-activity organization and a scoped site", () => {
  const organization = Organization.create({ tenantId: tenant, legalName: "Mobility Group SAS", displayName: "Mobility Group", countryCode: "FR", activities: ["vehicle_trade", "workshop", "parts"] });
  const site = Site.create({ tenantId: tenant, organizationId: organization.snapshot().id, name: "Site principal", countryCode: "FR", timezone: "Europe/Paris", activities: ["vehicle_trade", "workshop"] }, organization.snapshot());
  assert.deepEqual(site.snapshot().activities, ["vehicle_trade", "workshop"]);
});

test("refuses an activity not enabled at organization level", () => {
  const organization = Organization.create({ tenantId: tenant, legalName: "Workshop SAS", displayName: "Workshop", countryCode: "FR", activities: ["workshop"] });
  assert.throws(() => Site.create({ tenantId: tenant, organizationId: organization.snapshot().id, name: "Main site", countryCode: "FR", timezone: "Europe/Paris", activities: ["rental"] }, organization.snapshot()), (error: unknown) => error instanceof DomainError && error.code === "ACTIVITY_NOT_ENABLED");
});

test("enforces tenant, permission and site scopes", () => {
  const siteId = newEntityId();
  const organizationId=newEntityId();
  const membership = Membership.create({ tenantId: tenant, organizationId, userId: newEntityId(), role: "technician", siteIds: [siteId], extraPermissions: [] }).snapshot();
  authorize(membership, tenant, "workshop.manage", {organizationId,siteId});
  assert.throws(() => authorize(membership, tenant, "billing.manage", {organizationId,siteId}), (error: unknown) => error instanceof DomainError && error.code === "PERMISSION_DENIED");
  assert.throws(() => authorize(membership, tenant, "workshop.manage", {organizationId,siteId:newEntityId()}), (error: unknown) => error instanceof DomainError && error.code === "SITE_ACCESS_DENIED");
  assert.throws(() => authorize(membership, tenant, "workshop.manage", {organizationId:newEntityId(),siteId}), (error: unknown) => error instanceof DomainError && error.code === "ORGANIZATION_ACCESS_DENIED");
  assert.throws(() => authorize(membership, tenantId("22222222-2222-4222-8222-222222222222"), "workshop.manage", {organizationId,siteId}), (error: unknown) => error instanceof DomainError && error.code === "TENANT_ACCESS_DENIED");
});
