import test from "node:test";
import assert from "node:assert/strict";
import { newEntityId, tenantId, type RequestContext } from "../../core/src/identity.ts";
import { DomainError } from "../../core/src/errors.ts";
import { InMemoryAssetRepository } from "../src/in-memory-asset-repository.ts";
import { RegisterAsset } from "../src/register-asset.ts";

const context = (id: string): RequestContext => ({ tenantId: tenantId(id), actorId: newEntityId(), correlationId: "test" });

test("registers different mobility assets through one contract", async () => {
  const repository = new InMemoryAssetRepository();
  const useCase = new RegisterAsset(repository, () => new Date("2026-07-19T18:00:00Z"));
  const ctx = context("11111111-1111-4111-8111-111111111111");
  for (const kind of ["car", "motorcycle", "boat"] as const) {
    const asset = await useCase.execute(ctx, { ownerCustomerId: newEntityId(), kind, vinOrSerial: `${kind}-serial` });
    assert.equal(asset.kind, kind);
  }
  assert.equal(repository.events.length, 3);
  assert.ok(repository.events.every(event => event.type === "asset.registered.v1"));
});

test("isolates reads by tenant", async () => {
  const repository = new InMemoryAssetRepository();
  const useCase = new RegisterAsset(repository);
  const owner = context("11111111-1111-4111-8111-111111111111");
  const outsider = context("22222222-2222-4222-8222-222222222222");
  const asset = await useCase.execute(owner, { ownerCustomerId: newEntityId(), kind: "quad", vinOrSerial: "Q-42" });
  assert.ok(await repository.findById(owner.tenantId, asset.id));
  assert.equal(await repository.findById(outsider.tenantId, asset.id), null);
});

test("rejects an asset without a stable identifier", async () => {
  const useCase = new RegisterAsset(new InMemoryAssetRepository());
  await assert.rejects(
    () => useCase.execute(context("11111111-1111-4111-8111-111111111111"), { ownerCustomerId: newEntityId(), kind: "car" }),
    (error: unknown) => error instanceof DomainError && error.code === "ASSET_IDENTIFIER_REQUIRED"
  );
});
