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
const workflowStepBody=z.object({key:z.string().min(1),label:z.string().min(2),order:z.number().int().min(0),terminal:z.boolean().optional(),requiredFields:z.array(z.string()).optional(),defaultRole:z.string().min(1).optional(),slaMinutes:z.number().int().positive().optional()});
const workflowDefinitionBody=z.object({organizationId:uuid,activity:z.string().min(2),key:z.string().min(2),name:z.string().min(2),steps:z.array(workflowStepBody).min(2)});
const workflowStartBody=z.object({organizationId:uuid,siteId:uuid,definitionId:uuid,subjectType:z.string().min(2),subjectId:uuid,priority:z.enum(["low","normal","high","urgent"]),data:z.record(z.string(),z.union([z.string(),z.number(),z.boolean()])).default({})});
const workflowTransitionBody=z.object({to:z.string().min(1),expectedVersion:z.number().int().positive(),fields:z.record(z.string(),z.union([z.string(),z.number(),z.boolean()])).default({})});
const workItemAssignBody=z.object({instanceId:uuid,assignedTo:uuid});

export function registerWorkflowRoutes(app: FastifyInstance, contexts: RequestContextResolver, authorizer: RouteAuthorizer, workflows: ManageWorkflows): void {
  app.post("/v1/workflow-definitions",async request=>{const context=await contexts.resolve(request);const b=workflowDefinitionBody.parse(request.body);await authorizer.require(context,"organization.manage",{organizationId:b.organizationId as EntityId});return workflows.createDefinition(context,{...b,organizationId:b.organizationId as EntityId});});
  app.post("/v1/workflows",async request=>{const context=await contexts.resolve(request);const b=workflowStartBody.parse(request.body);await authorizer.require(context,"workshop.manage",{organizationId:b.organizationId as EntityId,siteId:b.siteId as EntityId});return workflows.start(context,{...b,organizationId:b.organizationId as EntityId,siteId:b.siteId as EntityId,definitionId:b.definitionId as EntityId,subjectId:b.subjectId as EntityId,priority:b.priority as WorkflowPriority});});
  app.post("/v1/workflows/:id/transition",async request=>{const context=await contexts.resolve(request);const p=z.object({id:uuid}).parse(request.params),b=workflowTransitionBody.parse(request.body);await authorizer.require(context,"workshop.manage",await workflows.scopeForInstance(context,p.id as EntityId));return workflows.transition(context,p.id as EntityId,b.to,b.expectedVersion,b.fields);});
  app.post("/v1/work-items/:id/assign",async request=>{const context=await contexts.resolve(request);const p=z.object({id:uuid}).parse(request.params),b=workItemAssignBody.parse(request.body);await authorizer.require(context,"workshop.manage",await workflows.scopeForInstance(context,b.instanceId as EntityId));return workflows.assign(context,p.id as EntityId,b.instanceId as EntityId,b.assignedTo as EntityId);});
  app.get("/v1/work-items",async request=>{const context=await contexts.resolve(request);await authorizer.require(context,"workshop.manage");const q=z.object({siteId:uuid.optional(),assignedTo:uuid.optional(),assignedRole:z.string().optional()}).parse(request.query),filters:{siteId?:EntityId;assignedTo?:EntityId;assignedRole?:string}={};if(q.siteId)filters.siteId=q.siteId as EntityId;if(q.assignedTo)filters.assignedTo=q.assignedTo as EntityId;if(q.assignedRole)filters.assignedRole=q.assignedRole;return workflows.queue(context,filters);});
}

