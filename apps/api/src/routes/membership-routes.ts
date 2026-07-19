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
const invitationBody = z.object({ organizationId: uuid, email: z.email(), role: z.enum(["owner", "admin", "manager", "advisor", "technician", "accountant", "viewer"]), siteIds: z.array(uuid), extraPermissions: z.array(z.enum(["organization.manage", "members.manage", "customers.read", "customers.write", "assets.read", "assets.write", "appointments.manage", "workshop.manage", "commerce.manage", "parts.manage", "billing.manage", "audit.read"])).optional() });
const acceptInvitationBody = z.object({ token: z.string().min(32) });

export function registerMembershipRoutes(app: FastifyInstance, contexts: RequestContextResolver, authorizer: RouteAuthorizer, memberships: ManageMemberships): void {
  app.post("/v1/membership-invitations", async request => { const context = await contexts.resolve(request); const body = invitationBody.parse(request.body); await authorizer.require(context, "members.manage", {organizationId:body.organizationId as EntityId}); const invitation = await memberships.invite(context, { ...body, organizationId: body.organizationId as EntityId, siteIds: body.siteIds as EntityId[] }); return { id: invitation.id, email: invitation.email, role: invitation.role, siteIds: invitation.siteIds, status: invitation.status, expiresAt: invitation.expiresAt }; });
  app.post("/v1/membership-invitations/accept", async request => { const context = await contexts.resolve(request); const body = acceptInvitationBody.parse(request.body); return memberships.accept(context, body.token); });
}

