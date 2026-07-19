import test from "node:test";
import assert from "node:assert/strict";
import { newEntityId, tenantId } from "../../core/src/identity.ts";
import { AuditRecorder, InMemoryAuditSink } from "../src/audit.ts";

test("records actor, tenant and correlation context", async () => {
  const sink = new InMemoryAuditSink();
  const recorder = new AuditRecorder(sink, () => new Date("2026-07-19T19:00:00Z"));
  const context = { tenantId: tenantId("11111111-1111-4111-8111-111111111111"), actorId: newEntityId(), correlationId: "request-42" };
  await recorder.record(context, { action: "asset.created", resourceType: "asset", resourceId: newEntityId(), metadata: { source: "professional_app" } });
  assert.equal(sink.entries[0]?.tenantId, context.tenantId);
  assert.equal(sink.entries[0]?.correlationId, "request-42");
});
