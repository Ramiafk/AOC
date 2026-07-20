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
const documentBody=z.object({ownerCustomerId:uuid,assetId:uuid.optional(),passportId:uuid.optional(),kind:z.enum(["invoice","quote","work_order","inspection_report","registration","insurance","warranty","photo","identity","cession_certificate","delivery_receipt","other"]),name:z.string().min(2),mimeType:z.string().min(3),sizeBytes:z.number().int().positive().max(104857600),contentHash:z.string().regex(/^[a-f0-9]{64}$/i),storageKey:z.string().min(3),classification:z.enum(["private","customer_shared","professional_shared","resale_public"]),retentionUntil:z.iso.datetime().optional()});
const consentBody=z.object({customerId:uuid,granteeOrganizationId:uuid,purpose:z.enum(["service_delivery","diagnosis","insurance_claim","vehicle_sale","fleet_management","legal_obligation"]),scopes:z.array(z.enum(["passport_summary","maintenance_history","documents","contact_details","vehicle_data"])).min(1),assetIds:z.array(uuid).min(1),expiresAt:z.iso.datetime()});
const shareBody=z.object({documentId:uuid,issuedToCustomerId:uuid.optional(),issuedToOrganizationId:uuid.optional(),maxDownloads:z.number().int().min(1).max(100),ttlMinutes:z.number().int().min(5).max(43200)});

export function registerDocumentRoutes(app: FastifyInstance, contexts: RequestContextResolver, authorizer: RouteAuthorizer, documents: ManageDocuments): void {
  app.post("/v1/documents",async request=>{const context=await contexts.resolve(request);await authorizer.require(context,"assets.write");const b=documentBody.parse(request.body);return documents.register(context,{...b,ownerCustomerId:b.ownerCustomerId as EntityId,assetId:b.assetId as EntityId|undefined,passportId:b.passportId as EntityId|undefined,kind:b.kind as DocumentKind,classification:b.classification as DocumentClassification});});
  app.post("/v1/consents",async request=>{const context=await contexts.resolve(request);await authorizer.require(context,"customers.write");const b=consentBody.parse(request.body);return documents.grantConsent(context,{...b,customerId:b.customerId as EntityId,granteeOrganizationId:b.granteeOrganizationId as EntityId,purpose:b.purpose as ConsentPurpose,scopes:b.scopes as ConsentScope[],assetIds:b.assetIds as EntityId[]});});
  app.post("/v1/document-shares",async request=>{const context=await contexts.resolve(request);await authorizer.require(context,"assets.read");const b=shareBody.parse(request.body);const issued=await documents.issueShare(context,{...b,documentId:b.documentId as EntityId,issuedToCustomerId:b.issuedToCustomerId as EntityId|undefined,issuedToOrganizationId:b.issuedToOrganizationId as EntityId|undefined});return{id:issued.grant.id,expiresAt:issued.grant.expiresAt,maxDownloads:issued.grant.maxDownloads};});
}
