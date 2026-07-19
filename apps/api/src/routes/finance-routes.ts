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
const orderBody=z.object({organizationId:uuid,siteId:uuid,customerId:uuid,quoteId:uuid,quoteStatus:z.string(),currency:z.string().regex(/^[A-Z]{3}$/),totalCents:z.number().int().min(0)});
const invoiceBody=z.object({orderId:uuid,paymentTermsDays:z.number().int().min(0).max(365)});
const paymentBody=z.object({invoiceId:uuid,provider:z.string().min(1),providerReference:z.string().min(1),idempotencyKey:z.string().min(3),amountCents:z.number().int().positive(),currency:z.string().regex(/^[A-Z]{3}$/),method:z.enum(["card","bank_transfer","cash","cheque","financing","other"])});

export function registerFinanceRoutes(app: FastifyInstance, contexts: RequestContextResolver, authorizer: RouteAuthorizer, finance: ManageFinance): void {
  app.post("/v1/orders",async request=>{const context=await contexts.resolve(request);const b=orderBody.parse(request.body);await authorizer.require(context,"billing.manage",{organizationId:b.organizationId as EntityId,siteId:b.siteId as EntityId});return finance.createOrder(context,{...b,organizationId:b.organizationId as EntityId,siteId:b.siteId as EntityId,customerId:b.customerId as EntityId,quoteId:b.quoteId as EntityId});});
  app.post("/v1/invoices",async request=>{const context=await contexts.resolve(request);const b=invoiceBody.parse(request.body);await authorizer.require(context,"billing.manage",await finance.scopeForOrder(context,b.orderId as EntityId));return finance.issueInvoice(context,{orderId:b.orderId as EntityId,paymentTermsDays:b.paymentTermsDays});});
  app.post("/v1/payments",async request=>{const context=await contexts.resolve(request);const b=paymentBody.parse(request.body);await authorizer.require(context,"billing.manage",await finance.scopeForInvoice(context,b.invoiceId as EntityId));return finance.recordPayment(context,{...b,invoiceId:b.invoiceId as EntityId,method:b.method as PaymentProps["method"]});});
}

