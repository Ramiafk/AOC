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
const pipelineStageBody=z.object({key:z.string().min(1),label:z.string().min(2),order:z.number().int().min(0),terminal:z.enum(["won","lost"]).optional(),requiredFields:z.array(z.string().min(1)).optional()});
const pipelineBody=z.object({organizationId:uuid,activity:z.string().min(2),name:z.string().min(2),stages:z.array(pipelineStageBody).min(2)});
const opportunityBody=z.object({organizationId:uuid,siteId:uuid,pipelineId:uuid,kind:z.enum(["service_quote","diagnostic","appointment","vehicle_purchase","vehicle_sale","rental","parts","body_shop","transport","other"]),title:z.string().min(2),customerId:uuid,assetId:uuid.optional(),channel:z.enum(["central_marketplace","professional_app","professional_website","staff","partner","api"]),acquisitionOwnerOrganizationId:uuid.optional(),assignedTo:uuid.optional(),estimatedValueCents:z.number().int().min(0).optional(),currency:z.string().regex(/^[A-Z]{3}$/),metadata:z.record(z.string(),z.union([z.string(),z.number(),z.boolean()])).default({})});
const opportunityMoveBody=z.object({stageKey:z.string().min(1),providedFields:z.array(z.string().min(1)).default([])});
const opportunityLostBody=z.object({reason:z.string().min(2)});

export function registerCrmRoutes(app: FastifyInstance, contexts: RequestContextResolver, authorizer: RouteAuthorizer, crm: ManageCrm): void {
  app.post("/v1/crm-pipelines",async request=>{const context=await contexts.resolve(request);const b=pipelineBody.parse(request.body);await authorizer.require(context,"commerce.manage",{organizationId:b.organizationId as EntityId});return crm.createPipeline(context,{...b,organizationId:b.organizationId as EntityId});});
  app.post("/v1/opportunities",async request=>{const context=await contexts.resolve(request);const b=opportunityBody.parse(request.body);await authorizer.require(context,"customers.write",{organizationId:b.organizationId as EntityId,siteId:b.siteId as EntityId});return crm.createOpportunity(context,{...b,organizationId:b.organizationId as EntityId,siteId:b.siteId as EntityId,pipelineId:b.pipelineId as EntityId,kind:b.kind as RequestKind,customerId:b.customerId as EntityId,assetId:b.assetId as EntityId|undefined,acquisitionOwnerOrganizationId:b.acquisitionOwnerOrganizationId as EntityId|undefined,assignedTo:b.assignedTo as EntityId|undefined});});
  app.post("/v1/opportunities/:id/move",async request=>{const context=await contexts.resolve(request);const p=z.object({id:uuid}).parse(request.params),b=opportunityMoveBody.parse(request.body);await authorizer.require(context,"customers.write",await crm.scopeForOpportunity(context,p.id as EntityId));return crm.move(context,p.id as EntityId,b.stageKey,b.providedFields);});
  app.post("/v1/opportunities/:id/lose",async request=>{const context=await contexts.resolve(request);const p=z.object({id:uuid}).parse(request.params),b=opportunityLostBody.parse(request.body);await authorizer.require(context,"customers.write",await crm.scopeForOpportunity(context,p.id as EntityId));return crm.lose(context,p.id as EntityId,b.reason);});
}

