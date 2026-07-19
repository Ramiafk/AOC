import type { FastifyRequest } from "fastify";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { invariant } from "../../../packages/core/src/errors.ts";
import { tenantId, type EntityId, type RequestContext } from "../../../packages/core/src/identity.ts";

export interface IdentityClaims { tenantId: string; actorId: string; email?: string | undefined }
export interface TokenVerifier { verify(token: string): Promise<IdentityClaims | null> }

export class RequestContextResolver {
  private readonly verifier: TokenVerifier;
  constructor(verifier: TokenVerifier) { this.verifier = verifier; }

  async resolve(request: FastifyRequest): Promise<RequestContext> {
    const authorization = request.headers.authorization;
    invariant(authorization !== undefined && authorization.startsWith("Bearer "), "AUTHENTICATION_REQUIRED", "A bearer token is required");
    const claims = await this.verifier.verify(authorization.slice(7));
    invariant(claims, "INVALID_TOKEN", "The access token is invalid");
    invariant(/^[0-9a-f-]{36}$/i.test(claims.actorId), "INVALID_ACTOR_ID", "Actor identifier must be a UUID");
    return {
      tenantId: tenantId(claims.tenantId),
      actorId: claims.actorId as EntityId,
      correlationId: String(request.id),
      verifiedEmail: claims.email?.trim().toLowerCase()
    };
  }
}

export class MapTokenVerifier implements TokenVerifier {
  private readonly tokens: ReadonlyMap<string, IdentityClaims>;
  constructor(tokens: ReadonlyMap<string, IdentityClaims>) { this.tokens = tokens; }
  async verify(token: string): Promise<IdentityClaims | null> { return this.tokens.get(token) ?? null; }
}

export class OidcTokenVerifier implements TokenVerifier {
  private readonly key: JWTVerifyGetKey;
  private readonly issuer: string;
  private readonly audience: string;

  constructor(input: { issuer: string; audience: string; jwksUrl?: URL; key?: JWTVerifyGetKey }) {
    invariant(Boolean(input.jwksUrl || input.key), "OIDC_KEY_REQUIRED", "A JWKS URL or key resolver is required");
    this.key = input.key ?? createRemoteJWKSet(input.jwksUrl!);
    this.issuer = input.issuer;
    this.audience = input.audience;
  }

  async verify(token: string): Promise<IdentityClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, { issuer: this.issuer, audience: this.audience, algorithms: ["RS256", "ES256"] });
      if (typeof payload.sub !== "string" || typeof payload.tenant_id !== "string") return null;
      const claims: IdentityClaims = { actorId: payload.sub, tenantId: payload.tenant_id };
      if (typeof payload.email === "string") claims.email = payload.email;
      return claims;
    } catch { return null; }
  }
}
