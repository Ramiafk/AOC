import test from "node:test";
import assert from "node:assert/strict";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { OidcTokenVerifier } from "../../apps/api/src/context-resolver.ts";

test("accepts only JWTs signed for the configured issuer and audience", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  const key = createLocalJWKSet({ keys: [{ ...jwk, kid: "test-key", alg: "RS256", use: "sig" }] });
  const verifier = new OidcTokenVerifier({ issuer: "https://identity.example.test", audience: "aos-api", key });
  const base = new SignJWT({ tenant_id: "11111111-1111-4111-8111-111111111111" }).setProtectedHeader({ alg: "RS256", kid: "test-key" }).setSubject("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa").setIssuer("https://identity.example.test").setIssuedAt().setExpirationTime("5m");
  const valid = await base.setAudience("aos-api").sign(privateKey);
  assert.deepEqual(await verifier.verify(valid), { tenantId: "11111111-1111-4111-8111-111111111111", actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });

  const wrongAudience = await new SignJWT({ tenant_id: "11111111-1111-4111-8111-111111111111" }).setProtectedHeader({ alg: "RS256", kid: "test-key" }).setSubject("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa").setIssuer("https://identity.example.test").setAudience("another-api").setIssuedAt().setExpirationTime("5m").sign(privateKey);
  assert.equal(await verifier.verify(wrongAudience), null);
});
