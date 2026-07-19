import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { DomainError } from "../../../../packages/core/src/errors.ts";
import type { EntityId } from "../../../../packages/core/src/identity.ts";
import { BUSINESS_ACTIVITIES, type BusinessActivity } from "../../../../packages/organizations/src/organization.ts";
import type { PlatformApplication } from "../application.ts";
import type { RequestContextResolver } from "../context-resolver.ts";
import type { RouteAuthorizer } from "../route-authorizer.ts";
import type { ManageMemberships } from "../../../../packages/organizations/src/manage-memberships.ts";
import type { ManageBookings } from "../../../../packages/booking/src/manage-bookings.ts";
import type { BookingChannel, PriceMode } from "../../../../packages/booking/src/booking.ts";
import type { ManagePassports } from "../../../../packages/passport/src/manage-passports.ts";
import type { DeadlineType, EntryVisibility, PassportEntryType, QrPurpose } from "../../../../packages/passport/src/passport.ts";
import type { ManageDocuments } from "../../../../packages/documents/src/manage-documents.ts";
import type { ConsentPurpose, ConsentScope, DocumentClassification, DocumentKind } from "../../../../packages/documents/src/documents.ts";
import type { ManageCrm } from "../../../../packages/crm/src/manage-crm.ts";
import type { RequestKind } from "../../../../packages/crm/src/crm.ts";
import type { ManageNotifications } from "../../../../packages/notifications/src/manage-notifications.ts";
import type { NotificationChannel, NotificationTopic } from "../../../../packages/notifications/src/notification.ts";
import type { ManageWorkflows } from "../../../../packages/workflows/src/manage-workflows.ts";
import type { WorkflowPriority } from "../../../../packages/workflows/src/workflow.ts";
import type { ManageQuotes } from "../../../../packages/quotes/src/manage-quotes.ts";
import type { QuoteLineKind } from "../../../../packages/quotes/src/quote.ts";
import type { ManageFinance } from "../../../../packages/finance/src/manage-finance.ts";
import type { PaymentProps } from "../../../../packages/finance/src/finance.ts";
import type { ManageWorkshop } from "../../../../packages/workshop/src/manage-workshop.ts";

const uuid = z.string().uuid();
const activity = z.string().refine(value => BUSINESS_ACTIVITIES.includes(value as never) || value.startsWith("custom:"));
const organizationBody = z.object({ legalName: z.string().min(2), displayName: z.string().min(2), countryCode: z.string().regex(/^[A-Z]{2}$/), activities: z.array(activity).min(1) });
const siteBody = z.object({ organizationId: uuid, name: z.string().min(2), countryCode: z.string().regex(/^[A-Z]{2}$/), timezone: z.string().min(3), activities: z.array(activity).min(1) });
const customerBody = z.object({ kind: z.enum(["individual", "business"]), displayName: z.string().min(2), email: z.email().optional(), phone: z.string().min(6).optional(), acquisitionChannel: z.enum(["central_marketplace", "professional_app", "professional_website", "staff", "partner", "api"]), acquisitionOwnerOrganizationId: uuid.optional() });
const assetBody = z.object({ ownerCustomerId: uuid, kind: z.string().min(1), registration: z.string().min(1).optional(), vinOrSerial: z.string().min(1).optional(), manufacturer: z.string().optional(), model: z.string().optional(), attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional() });

export function registerOrganizationRoutes(app: FastifyInstance, contexts: RequestContextResolver, authorizer: RouteAuthorizer, application: PlatformApplication): void {
  app.get("/health", async () => ({ status: "ok" }));
  app.post("/v1/organizations", async request => { const context = await contexts.resolve(request); await authorizer.require(context, "organization.manage"); return application.createOrganization(context, organizationBody.parse(request.body) as { legalName: string; displayName: string; countryCode: string; activities: BusinessActivity[] }); });
  app.post("/v1/sites", async request => { const context = await contexts.resolve(request); const body = siteBody.parse(request.body); await authorizer.require(context, "organization.manage", {organizationId:body.organizationId as EntityId}); return application.createSite(context, { ...body, organizationId: body.organizationId as EntityId, activities: body.activities as BusinessActivity[] }); });
  app.post("/v1/customers", async request => { const context = await contexts.resolve(request); await authorizer.require(context, "customers.write"); const body = customerBody.parse(request.body); return application.createCustomer(context, { ...body, acquisitionOwnerOrganizationId: body.acquisitionOwnerOrganizationId as EntityId | undefined }); });
  app.post("/v1/assets", async request => { const context = await contexts.resolve(request); await authorizer.require(context, "assets.write"); const body = assetBody.parse(request.body); return application.createAsset(context, { ...body, ownerCustomerId: body.ownerCustomerId as EntityId, kind: body.kind as `custom:${string}` }); });
}
