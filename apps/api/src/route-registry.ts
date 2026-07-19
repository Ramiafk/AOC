import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import { DomainError } from "../../../packages/core/src/errors.ts";
import type { PlatformApplication } from "./application.ts";
import type { RequestContextResolver } from "./context-resolver.ts";
import type { RouteAuthorizer } from "./route-authorizer.ts";
import type { ManageMemberships } from "../../../packages/organizations/src/manage-memberships.ts";
import type { ManageBookings } from "../../../packages/booking/src/manage-bookings.ts";
import type { ManagePassports } from "../../../packages/passport/src/manage-passports.ts";
import type { ManageDocuments } from "../../../packages/documents/src/manage-documents.ts";
import type { ManageCrm } from "../../../packages/crm/src/manage-crm.ts";
import type { ManageNotifications } from "../../../packages/notifications/src/manage-notifications.ts";
import type { ManageWorkflows } from "../../../packages/workflows/src/manage-workflows.ts";
import type { ManageQuotes } from "../../../packages/quotes/src/manage-quotes.ts";
import type { ManageFinance } from "../../../packages/finance/src/manage-finance.ts";
import type { ManageWorkshop } from "../../../packages/workshop/src/manage-workshop.ts";
import type { ManageInventory } from "../../../packages/inventory/src/manage-inventory.ts";
import { registerOrganizationRoutes } from "./routes/core-routes.ts";
import { registerMembershipRoutes } from "./routes/membership-routes.ts";
import { registerBookingRoutes } from "./routes/booking-routes.ts";
import { registerPassportRoutes } from "./routes/passport-routes.ts";
import { registerDocumentRoutes } from "./routes/document-routes.ts";
import { registerCrmRoutes } from "./routes/crm-routes.ts";
import { registerNotificationRoutes } from "./routes/notification-routes.ts";
import { registerWorkflowRoutes } from "./routes/workflow-routes.ts";
import { registerQuoteRoutes } from "./routes/quote-routes.ts";
import { registerFinanceRoutes } from "./routes/finance-routes.ts";
import { registerWorkshopRoutes } from "./routes/workshop-routes.ts";
import { registerInventoryRoutes } from "./routes/inventory-routes.ts";

export interface ApiModules {
  memberships?: ManageMemberships;
  bookings?: ManageBookings;
  passports?: ManagePassports;
  documents?: ManageDocuments;
  crm?: ManageCrm;
  notifications?: ManageNotifications;
  workflows?: ManageWorkflows;
  quotes?: ManageQuotes;
  finance?: ManageFinance;
  workshop?: ManageWorkshop;
  inventory?: ManageInventory;
}

export interface ApiComposition {
  application: PlatformApplication;
  contexts: RequestContextResolver;
  authorizer: RouteAuthorizer;
  modules?: ApiModules;
}

export function buildRouteRegistry({ application, contexts, authorizer, modules = {} }: ApiComposition): FastifyInstance {
  const app = Fastify({ logger: false });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError) return reply.status(400).send({ error: "INVALID_REQUEST", details: error.issues });
    if (error instanceof DomainError) {
      const status = error.code.includes("AUTH") || error.code === "INVALID_TOKEN" ? 401 : error.code.includes("DENIED") ? 403 : 422;
      return reply.status(status).send({ error: error.code, message: error.message });
    }
    if (error instanceof Error && error.message === "ORGANIZATION_NOT_FOUND") return reply.status(404).send({ error: error.message });
    return reply.status(500).send({ error: "INTERNAL_ERROR" });
  });

  registerOrganizationRoutes(app, contexts, authorizer, application);
  if (modules.memberships) registerMembershipRoutes(app, contexts, authorizer, modules.memberships);
  if (modules.bookings) registerBookingRoutes(app, contexts, authorizer, modules.bookings);
  if (modules.passports) registerPassportRoutes(app, contexts, authorizer, modules.passports);
  if (modules.documents) registerDocumentRoutes(app, contexts, authorizer, modules.documents);
  if (modules.crm) registerCrmRoutes(app, contexts, authorizer, modules.crm);
  if (modules.notifications) registerNotificationRoutes(app, contexts, authorizer, modules.notifications);
  if (modules.workflows) registerWorkflowRoutes(app, contexts, authorizer, modules.workflows);
  if (modules.quotes) registerQuoteRoutes(app, contexts, authorizer, modules.quotes);
  if (modules.finance) registerFinanceRoutes(app, contexts, authorizer, modules.finance);
  if (modules.workshop) registerWorkshopRoutes(app, contexts, authorizer, modules.workshop);
  if (modules.inventory) registerInventoryRoutes(app, contexts, authorizer, modules.inventory);
  return app;
}
