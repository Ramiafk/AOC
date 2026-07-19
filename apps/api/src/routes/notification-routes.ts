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
const notificationChannel=z.enum(["email","sms","push","in_app"]);
const notificationTopic=z.enum(["appointment","service","document","passport","security","marketing"]);
const notificationTemplateBody=z.object({organizationId:uuid,key:z.string().min(2),locale:z.string().min(2),channel:notificationChannel,topic:notificationTopic,subject:z.string().min(1).optional(),body:z.string().min(2)});
const notificationPreferenceBody=z.object({customerId:uuid,topic:notificationTopic,enabledChannels:z.array(notificationChannel),marketingConsent:z.boolean(),locale:z.string().min(2),timezone:z.string().min(3)});
const queueNotificationBody=z.object({organizationId:uuid,customerId:uuid,templateKey:z.string().min(2),topic:notificationTopic,locale:z.string().min(2),channels:z.array(notificationChannel).min(1),addresses:z.object({email:z.email().optional(),sms:z.string().min(6).optional(),push:z.string().min(8).optional()}),variables:z.record(z.string(),z.union([z.string(),z.number()])),brand:z.object({name:z.string().min(2),primaryColor:z.string().regex(/^#[0-9a-f]{6}$/i)}),idempotencyKey:z.string().min(3).max(200)});

export function registerNotificationRoutes(app: FastifyInstance, contexts: RequestContextResolver, authorizer: RouteAuthorizer, notifications: ManageNotifications): void {
  app.post("/v1/notification-templates",async request=>{const context=await contexts.resolve(request);const b=notificationTemplateBody.parse(request.body);await authorizer.require(context,"organization.manage",{organizationId:b.organizationId as EntityId});return notifications.createTemplate(context,{...b,organizationId:b.organizationId as EntityId,channel:b.channel as NotificationChannel,topic:b.topic as NotificationTopic});});
  app.put("/v1/notification-preferences",async request=>{const context=await contexts.resolve(request);await authorizer.require(context,"customers.write");const b=notificationPreferenceBody.parse(request.body);return notifications.setPreference(context,{...b,customerId:b.customerId as EntityId,topic:b.topic as NotificationTopic,enabledChannels:b.enabledChannels as NotificationChannel[]});});
  app.post("/v1/notifications",async request=>{const context=await contexts.resolve(request);const b=queueNotificationBody.parse(request.body);await authorizer.require(context,"customers.write",{organizationId:b.organizationId as EntityId});return notifications.queue(context,{...b,organizationId:b.organizationId as EntityId,customerId:b.customerId as EntityId,topic:b.topic as NotificationTopic,channels:b.channels as NotificationChannel[]});});
  app.post("/v1/notifications/:id/dispatch",async request=>{const context=await contexts.resolve(request);const p=z.object({id:uuid}).parse(request.params);await authorizer.require(context,"customers.write",await notifications.scopeForNotification(context,p.id as EntityId));return notifications.dispatch(context,p.id as EntityId);});
  app.get("/v1/customers/:customerId/notifications",async request=>{const context=await contexts.resolve(request);await authorizer.require(context,"customers.read");const p=z.object({customerId:uuid}).parse(request.params);return notifications.listForCustomer(context,p.customerId as EntityId);});
}

