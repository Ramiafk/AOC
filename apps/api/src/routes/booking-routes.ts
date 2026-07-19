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
const offeringBody = z.object({ organizationId: uuid, siteId: uuid, activity: z.string().min(2), name: z.string().min(2), durationMinutes: z.number().int().min(5).max(1440), bufferMinutes: z.number().int().min(0).max(240).default(0), capacity: z.number().int().min(1).default(1), priceMode: z.enum(["fixed", "from", "quote"]), priceCents: z.number().int().min(0).optional(), currency: z.string().regex(/^[A-Z]{3}$/), publishedChannels: z.array(z.enum(["central_marketplace", "professional_app", "professional_website", "staff", "partner", "api"])).min(1) });
const slotBody = z.object({ offeringId: uuid, startsAt: z.iso.datetime(), capacity: z.number().int().min(1).optional() });
const bookingBody = z.object({ slotId: uuid, customerId: uuid, assetId: uuid.optional(), channel: z.enum(["central_marketplace", "professional_app", "professional_website", "staff", "partner", "api"]), acquisitionOwnerOrganizationId: uuid.optional(), marketplaceCommissionBasisPoints: z.number().int().min(0).max(10000).optional() });

export function registerBookingRoutes(app: FastifyInstance, contexts: RequestContextResolver, authorizer: RouteAuthorizer, bookings: ManageBookings): void {
  app.post("/v1/service-offerings", async request => { const context = await contexts.resolve(request); const body = offeringBody.parse(request.body); await authorizer.require(context, "appointments.manage", {organizationId:body.organizationId as EntityId,siteId:body.siteId as EntityId}); return bookings.createOffering(context, { ...body, organizationId: body.organizationId as EntityId, siteId: body.siteId as EntityId, priceMode: body.priceMode as PriceMode, publishedChannels: body.publishedChannels as BookingChannel[] }); });
  app.post("/v1/availability-slots", async request => { const context = await contexts.resolve(request); const body = slotBody.parse(request.body); await authorizer.require(context, "appointments.manage", await bookings.scopeForOffering(context, body.offeringId as EntityId)); return bookings.createSlot(context, { ...body, offeringId: body.offeringId as EntityId }); });
  app.post("/v1/bookings", async request => { const context = await contexts.resolve(request); const body = bookingBody.parse(request.body); await authorizer.require(context, "appointments.manage", await bookings.scopeForSlot(context, body.slotId as EntityId)); return bookings.book(context, { ...body, slotId: body.slotId as EntityId, customerId: body.customerId as EntityId, assetId: body.assetId as EntityId | undefined, acquisitionOwnerOrganizationId: body.acquisitionOwnerOrganizationId as EntityId | undefined }); });
  app.post("/v1/bookings/:id/cancel", async request => { const context = await contexts.resolve(request); const params = z.object({ id: uuid }).parse(request.params); await authorizer.require(context, "appointments.manage", await bookings.scopeForBooking(context, params.id as EntityId)); return bookings.cancel(context, params.id as EntityId); });
}

