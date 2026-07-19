import test from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { AuditRecorder, InMemoryAuditSink } from "../audit/src/audit.ts";
import { PlatformApplication } from "../../apps/api/src/application.ts";
import { buildApp, type ApiModules } from "../../apps/api/src/build-app.ts";
import { MapTokenVerifier, RequestContextResolver } from "../../apps/api/src/context-resolver.ts";
import { InMemoryPlatformRepository } from "../../apps/api/src/in-memory-platform-repository.ts";
import { InMemoryMembershipReader, RouteAuthorizer } from "../../apps/api/src/route-authorizer.ts";
import { Membership } from "../organizations/src/access-control.ts";
import { tenantId, type EntityId } from "../core/src/identity.ts";
import type { ManageBookings } from "../booking/src/manage-bookings.ts";
import type { ManageCrm } from "../crm/src/manage-crm.ts";
import type { ManageNotifications } from "../notifications/src/manage-notifications.ts";
import type { ManageWorkflows } from "../workflows/src/manage-workflows.ts";
import type { ManageQuotes } from "../quotes/src/manage-quotes.ts";
import type { ManageFinance } from "../finance/src/manage-finance.ts";
import type { ManageWorkshop } from "../workshop/src/manage-workshop.ts";

const tenant = "11111111-1111-4111-8111-111111111111";
const actor = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const organizationA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as EntityId;
const organizationB = "cccccccc-cccc-4ccc-8ccc-cccccccccccc" as EntityId;
const siteA = "dddddddd-dddd-4ddd-8ddd-dddddddddddd" as EntityId;
const siteB = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" as EntityId;
const resourceId = "ffffffff-ffff-4fff-8fff-ffffffffffff" as EntityId;
const headers = { authorization: "Bearer scoped-token" };

function scopedApp(modules: ApiModules, role: "owner" | "manager" = "owner"): FastifyInstance {
  const application = new PlatformApplication(new InMemoryPlatformRepository(), new AuditRecorder(new InMemoryAuditSink()));
  const contexts = new RequestContextResolver(new MapTokenVerifier(new Map([["scoped-token", { tenantId: tenant, actorId: actor }]])));
  const membership = Membership.create({ tenantId: tenantId(tenant), organizationId: organizationA, userId: actor as EntityId, role, siteIds: role === "owner" ? [] : [siteA], extraPermissions: [] }).snapshot();
  return buildApp({ application, contexts, authorizer: new RouteAuthorizer(new InMemoryMembershipReader([membership])), modules });
}

test("rejects cross-organization opaque resources for every routed business family", async () => {
  const scope = async () => ({ organizationId: organizationB, siteId: siteB });
  const cases: Array<{ modules: ApiModules; method: "POST"; url: string; payload?: object }> = [
    { modules: { bookings: { scopeForOffering: scope } as unknown as ManageBookings }, method: "POST", url: "/v1/availability-slots", payload: { offeringId: resourceId, startsAt: "2026-08-01T10:00:00.000Z" } },
    { modules: { crm: { scopeForOpportunity: scope } as unknown as ManageCrm }, method: "POST", url: `/v1/opportunities/${resourceId}/move`, payload: { stageKey: "qualified", providedFields: [] } },
    { modules: { notifications: { scopeForNotification: scope } as unknown as ManageNotifications }, method: "POST", url: `/v1/notifications/${resourceId}/dispatch` },
    { modules: { workflows: { scopeForInstance: scope } as unknown as ManageWorkflows }, method: "POST", url: `/v1/workflows/${resourceId}/transition`, payload: { to: "done", expectedVersion: 1, fields: {} } },
    { modules: { quotes: { scopeForQuote: scope } as unknown as ManageQuotes }, method: "POST", url: `/v1/quotes/${resourceId}/send` },
    { modules: { finance: { scopeForOrder: scope } as unknown as ManageFinance }, method: "POST", url: "/v1/invoices", payload: { orderId: resourceId, paymentTermsDays: 30 } },
    { modules: { workshop: { scopeForWorkOrder: scope } as unknown as ManageWorkshop }, method: "POST", url: `/v1/work-orders/${resourceId}/diagnose` }
  ];

  for (const entry of cases) {
    const app = scopedApp(entry.modules);
    const request = { method: entry.method, url: entry.url, headers } as { method: "POST"; url: string; headers: typeof headers; payload?: object };
    if (entry.payload) request.payload = entry.payload;
    const response = await app.inject(request);
    assert.equal(response.statusCode, 403, entry.url);
    assert.equal(response.json().error, "ORGANIZATION_ACCESS_DENIED", entry.url);
    await app.close();
  }
});

test("rejects an allowed organization when the member is outside the target site", async () => {
  const bookings = { createOffering: async () => assert.fail("handler must not execute") } as unknown as ManageBookings;
  const app = scopedApp({ bookings }, "manager");
  const response = await app.inject({ method: "POST", url: "/v1/service-offerings", headers, payload: { organizationId: organizationA, siteId: siteB, activity: "workshop", name: "Cross-site", durationMinutes: 30, bufferMinutes: 0, capacity: 1, priceMode: "fixed", priceCents: 5000, currency: "EUR", publishedChannels: ["staff"] } });
  assert.equal(response.statusCode, 403);
  assert.equal(response.json().error, "SITE_ACCESS_DENIED");
  await app.close();
});

test("rejects cross-organization notification and workflow definitions from their body scope", async () => {
  const notifications = { createTemplate: async () => assert.fail("handler must not execute") } as unknown as ManageNotifications;
  const workflows = { createDefinition: async () => assert.fail("handler must not execute") } as unknown as ManageWorkflows;
  const app = scopedApp({ notifications, workflows });
  const template = await app.inject({ method: "POST", url: "/v1/notification-templates", headers, payload: { organizationId: organizationB, key: "blocked", locale: "fr-FR", channel: "email", topic: "security", body: "Blocked" } });
  const definition = await app.inject({ method: "POST", url: "/v1/workflow-definitions", headers, payload: { organizationId: organizationB, activity: "workshop", key: "blocked", name: "Blocked", steps: [{ key: "start", label: "Start", order: 1 }, { key: "done", label: "Done", order: 2, terminal: true }] } });
  assert.equal(template.json().error, "ORGANIZATION_ACCESS_DENIED");
  assert.equal(definition.json().error, "ORGANIZATION_ACCESS_DENIED");
  await app.close();
});
