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
const workOrderBody=z.object({organizationId:uuid,siteId:uuid,customerId:uuid,assetId:uuid,bookingId:uuid.optional(),quoteId:uuid.optional(),checkIn:z.object({mileage:z.number().int().min(0),fuelLevelPercent:z.number().min(0).max(100),customerConcerns:z.array(z.string().min(2)).min(1),damageNotes:z.string().optional(),photoDocumentIds:z.array(uuid).default([]),keysReceived:z.number().int().min(0)})});
const workshopJobBody=z.object({label:z.string().min(2),kind:z.enum(["labor","diagnostic","service"]),estimatedMinutes:z.number().int().positive(),approvalRequired:z.boolean(),diagnosis:z.string().optional(),technicianId:uuid.optional()});
const workshopAuthorizeBody=z.object({jobIds:z.array(uuid).min(1)}),workshopStartBody=z.object({jobId:uuid,technicianId:uuid}),workshopTimeBody=z.object({jobId:uuid,minutes:z.number().int().positive()}),workshopCompleteBody=z.object({jobId:uuid,diagnosis:z.string().optional()}),workshopQualityBody=z.object({notes:z.string().min(2)});

export function registerWorkshopRoutes(app: FastifyInstance, contexts: RequestContextResolver, authorizer: RouteAuthorizer, workshop: ManageWorkshop): void {
  const workOrderId=(request:unknown)=>z.object({id:uuid}).parse(request).id as EntityId;
  app.post("/v1/work-orders",async request=>{const context=await contexts.resolve(request);const b=workOrderBody.parse(request.body);await authorizer.require(context,"workshop.manage",{organizationId:b.organizationId as EntityId,siteId:b.siteId as EntityId});const input={organizationId:b.organizationId as EntityId,siteId:b.siteId as EntityId,customerId:b.customerId as EntityId,assetId:b.assetId as EntityId,checkIn:{...b.checkIn,photoDocumentIds:b.checkIn.photoDocumentIds as EntityId[]}} as Parameters<ManageWorkshop["checkIn"]>[1];if(b.bookingId)input.bookingId=b.bookingId as EntityId;if(b.quoteId)input.quoteId=b.quoteId as EntityId;return workshop.checkIn(context,input);});
  app.post("/v1/work-orders/:id/diagnose",async request=>{const c=await contexts.resolve(request);const id=workOrderId(request.params);await authorizer.require(c,"workshop.manage",await workshop.scopeForWorkOrder(c,id));return workshop.diagnose(c,id);});
  app.post("/v1/work-orders/:id/jobs",async request=>{const c=await contexts.resolve(request);const id=workOrderId(request.params);await authorizer.require(c,"workshop.manage",await workshop.scopeForWorkOrder(c,id));const b=workshopJobBody.parse(request.body);return workshop.addJob(c,id,b as Parameters<ManageWorkshop["addJob"]>[2]);});
  app.post("/v1/work-orders/:id/authorize",async request=>{const c=await contexts.resolve(request);const id=workOrderId(request.params);await authorizer.require(c,"workshop.manage",await workshop.scopeForWorkOrder(c,id));const b=workshopAuthorizeBody.parse(request.body);return workshop.authorize(c,id,b.jobIds as EntityId[]);});
  app.post("/v1/work-orders/:id/jobs/start",async request=>{const c=await contexts.resolve(request);const id=workOrderId(request.params);await authorizer.require(c,"workshop.manage",await workshop.scopeForWorkOrder(c,id));const b=workshopStartBody.parse(request.body);return workshop.startJob(c,id,b.jobId as EntityId,b.technicianId as EntityId);});
  app.post("/v1/work-orders/:id/time",async request=>{const c=await contexts.resolve(request);const id=workOrderId(request.params);await authorizer.require(c,"workshop.manage",await workshop.scopeForWorkOrder(c,id));const b=workshopTimeBody.parse(request.body);return workshop.recordTime(c,id,b.jobId as EntityId,b.minutes);});
  app.post("/v1/work-orders/:id/jobs/complete",async request=>{const c=await contexts.resolve(request);const id=workOrderId(request.params);await authorizer.require(c,"workshop.manage",await workshop.scopeForWorkOrder(c,id));const b=workshopCompleteBody.parse(request.body);return workshop.completeJob(c,id,b.jobId as EntityId,b.diagnosis);});
  app.post("/v1/work-orders/:id/quality-control",async request=>{const c=await contexts.resolve(request);const id=workOrderId(request.params);await authorizer.require(c,"workshop.manage",await workshop.scopeForWorkOrder(c,id));return workshop.requestQuality(c,id);});
  app.post("/v1/work-orders/:id/quality-approve",async request=>{const c=await contexts.resolve(request);const id=workOrderId(request.params);await authorizer.require(c,"workshop.manage",await workshop.scopeForWorkOrder(c,id));const b=workshopQualityBody.parse(request.body);return workshop.approveQuality(c,id,b.notes);});
  app.post("/v1/work-orders/:id/release",async request=>{const c=await contexts.resolve(request);const id=workOrderId(request.params);await authorizer.require(c,"workshop.manage",await workshop.scopeForWorkOrder(c,id));return workshop.release(c,id);});
}
