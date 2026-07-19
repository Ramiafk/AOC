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
const quoteLineBody=z.object({kind:z.enum(["labor","part","service","fee"]),reference:z.string().optional(),label:z.string().min(2),quantity:z.number().positive(),unitPriceCents:z.number().int().min(0),unitCostCents:z.number().int().min(0).optional(),discountBasisPoints:z.number().int().min(0).max(10000).optional(),taxRateBasisPoints:z.number().int().min(0).max(10000).optional()});
const quoteBody=z.object({organizationId:uuid,siteId:uuid,customerId:uuid,assetId:uuid.optional(),opportunityId:uuid.optional(),lines:z.array(quoteLineBody).min(1),policy:z.object({currency:z.string().regex(/^[A-Z]{3}$/),taxRateBasisPoints:z.number().int().min(0).max(10000),maxDiscountBasisPoints:z.number().int().min(0).max(10000),minimumMarginBasisPoints:z.number().int().min(0).max(10000),validityDays:z.number().int().min(1).max(365)}),terms:z.string().min(2)});
const quoteAcceptBody=z.object({customerId:uuid,expectedTotalCents:z.number().int().min(0),termsHash:z.string().regex(/^[a-f0-9]{64}$/i)});

export function registerQuoteRoutes(app: FastifyInstance, contexts: RequestContextResolver, authorizer: RouteAuthorizer, quotes: ManageQuotes): void {
  app.post("/v1/quotes",async request=>{const context=await contexts.resolve(request);const b=quoteBody.parse(request.body);await authorizer.require(context,"billing.manage",{organizationId:b.organizationId as EntityId,siteId:b.siteId as EntityId});const input:{organizationId:EntityId;siteId:EntityId;customerId:EntityId;assetId?:EntityId;opportunityId?:EntityId;lines:{kind:QuoteLineKind;reference?:string;label:string;quantity:number;unitPriceCents:number;unitCostCents?:number;discountBasisPoints?:number;taxRateBasisPoints?:number}[];policy:typeof b.policy;terms:string}={organizationId:b.organizationId as EntityId,siteId:b.siteId as EntityId,customerId:b.customerId as EntityId,lines:b.lines as typeof input.lines,policy:b.policy,terms:b.terms};if(b.assetId)input.assetId=b.assetId as EntityId;if(b.opportunityId)input.opportunityId=b.opportunityId as EntityId;return quotes.create(context,input);});
  app.post("/v1/quotes/:id/send",async request=>{const context=await contexts.resolve(request);const p=z.object({id:uuid}).parse(request.params);await authorizer.require(context,"billing.manage",await quotes.scopeForQuote(context,p.id as EntityId));return quotes.send(context,p.id as EntityId);});
  app.post("/v1/quotes/:id/accept",async request=>{const context=await contexts.resolve(request);const p=z.object({id:uuid}).parse(request.params),b=quoteAcceptBody.parse(request.body);await authorizer.require(context,"customers.write",await quotes.scopeForQuote(context,p.id as EntityId));return quotes.accept(context,p.id as EntityId,{...b,customerId:b.customerId as EntityId});});
}

