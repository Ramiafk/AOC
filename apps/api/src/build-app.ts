import type { FastifyInstance } from "fastify";
import { buildRouteRegistry, type ApiComposition } from "./route-registry.ts";

/**
 * HTTP composition root. Business route modules are selected explicitly by name
 * by each runtime profile; route registration lives outside the bootstrap.
 */
export function buildApp(composition: ApiComposition): FastifyInstance {
  return buildRouteRegistry(composition);
}

export type { ApiComposition, ApiModules } from "./route-registry.ts";
