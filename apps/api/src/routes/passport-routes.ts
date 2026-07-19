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
const passportBody=z.object({assetId:uuid,ownerCustomerId:uuid});
const passportEntryBody=z.object({passportId:uuid,assetId:uuid,type:z.enum(["maintenance","repair","inspection","body_work","tyres","battery","ownership","document","custom"]),title:z.string().min(2),occurredAt:z.iso.datetime(),mileage:z.number().int().min(0).optional(),providerOrganizationId:uuid.optional(),documentIds:z.array(uuid).default([]),visibility:z.enum(["owner_only","shared_professionals","resale_public"])});
const deadlineBody=z.object({passportId:uuid,assetId:uuid,type:z.enum(["maintenance","technical_inspection","insurance","warranty","registration","lease","custom"]),label:z.string().min(2),dueAt:z.iso.datetime(),dueMileage:z.number().int().min(0).optional(),sourceEntryId:uuid.optional()});
const qrBody=z.object({passportId:uuid,purpose:z.enum(["owner_portal","booking","service_intake","resale_view"]),ttlMinutes:z.number().int().min(5).max(525600),maxUses:z.number().int().min(1).max(10000)});

export function registerPassportRoutes(app: FastifyInstance, contexts: RequestContextResolver, authorizer: RouteAuthorizer, passports: ManagePassports): void {
  app.post("/v1/passports",async request=>{const context=await contexts.resolve(request);await authorizer.require(context,"assets.write");const body=passportBody.parse(request.body);return passports.create(context,{assetId:body.assetId as EntityId,ownerCustomerId:body.ownerCustomerId as EntityId});});
  app.post("/v1/passport-entries",async request=>{const context=await contexts.resolve(request);await authorizer.require(context,"assets.write");const body=passportEntryBody.parse(request.body);return passports.addEntry(context,{...body,passportId:body.passportId as EntityId,assetId:body.assetId as EntityId,type:body.type as PassportEntryType,providerOrganizationId:body.providerOrganizationId as EntityId|undefined,documentIds:body.documentIds as EntityId[],visibility:body.visibility as EntryVisibility});});
  app.post("/v1/asset-deadlines",async request=>{const context=await contexts.resolve(request);await authorizer.require(context,"assets.write");const body=deadlineBody.parse(request.body);return passports.addDeadline(context,{...body,passportId:body.passportId as EntityId,assetId:body.assetId as EntityId,type:body.type as DeadlineType,sourceEntryId:body.sourceEntryId as EntityId|undefined});});
  app.post("/v1/passport-qr-grants",async request=>{const context=await contexts.resolve(request);await authorizer.require(context,"assets.write");const body=qrBody.parse(request.body);return passports.issueQr(context,{...body,passportId:body.passportId as EntityId,purpose:body.purpose as QrPurpose});});
}

