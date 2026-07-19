import { InMemoryAuditSink, AuditRecorder } from "../../../packages/audit/src/audit.ts";
import { PlatformApplication } from "./application.ts";
import { buildApp } from "./build-app.ts";
import { MapTokenVerifier, RequestContextResolver } from "./context-resolver.ts";
import { InMemoryPlatformRepository } from "./in-memory-platform-repository.ts";
import { Membership } from "../../../packages/organizations/src/access-control.ts";
import { RouteAuthorizer } from "./route-authorizer.ts";
import type { EntityId } from "../../../packages/core/src/identity.ts";
import { tenantId } from "../../../packages/core/src/identity.ts";
import { InMemoryMembershipRepository } from "../../../packages/organizations/src/in-memory-membership-repository.ts";
import { InMemoryInvitationNotifier, ManageMemberships } from "../../../packages/organizations/src/manage-memberships.ts";

const tenant = process.env.DEV_TENANT_ID;
const actor = process.env.DEV_ACTOR_ID;
const token = process.env.DEV_ACCESS_TOKEN;
if (!tenant || !actor || !token) throw new Error("DEV_TENANT_ID, DEV_ACTOR_ID and DEV_ACCESS_TOKEN are required");

const repository = new InMemoryPlatformRepository();
const application = new PlatformApplication(repository, new AuditRecorder(new InMemoryAuditSink()));
const contexts = new RequestContextResolver(new MapTokenVerifier(new Map([[token, { tenantId: tenant, actorId: actor }]])));
const membership = Membership.create({ tenantId: tenantId(tenant), organizationId: actor as EntityId, userId: actor as EntityId, role: "owner", siteIds: [], extraPermissions: [] }).snapshot();
const membershipRepository = new InMemoryMembershipRepository([membership]);
const authorizer = new RouteAuthorizer(membershipRepository);
const memberships = new ManageMemberships(membershipRepository, new InMemoryInvitationNotifier());
await buildApp(application, contexts, authorizer, memberships).listen({ host: "127.0.0.1", port: Number(process.env.PORT ?? 3000) });
