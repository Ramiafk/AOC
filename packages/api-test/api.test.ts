import test from "node:test";
import assert from "node:assert/strict";
import { AuditRecorder, InMemoryAuditSink } from "../audit/src/audit.ts";
import { PlatformApplication } from "../../apps/api/src/application.ts";
import { buildApp } from "../../apps/api/src/build-app.ts";
import { MapTokenVerifier, RequestContextResolver } from "../../apps/api/src/context-resolver.ts";
import { InMemoryPlatformRepository } from "../../apps/api/src/in-memory-platform-repository.ts";
import { Membership } from "../organizations/src/access-control.ts";
import { InMemoryMembershipReader, RouteAuthorizer } from "../../apps/api/src/route-authorizer.ts";
import { tenantId as parseTenantId, type EntityId } from "../core/src/identity.ts";
import { InMemoryMembershipRepository } from "../organizations/src/in-memory-membership-repository.ts";
import { InMemoryInvitationNotifier, ManageMemberships } from "../organizations/src/manage-memberships.ts";
import { InMemoryCrmRepository } from "../crm/src/in-memory-crm-repository.ts";
import { ManageCrm } from "../crm/src/manage-crm.ts";
import { InMemoryNotificationRepository, RecordingNotificationGateway } from "../notifications/src/in-memory-notification-repository.ts";
import { ManageNotifications } from "../notifications/src/manage-notifications.ts";
import { InMemoryWorkflowRepository } from "../workflows/src/in-memory-workflow-repository.ts";
import { ManageWorkflows } from "../workflows/src/manage-workflows.ts";
import { InMemoryQuoteRepository } from "../quotes/src/in-memory-quote-repository.ts";
import { ManageQuotes } from "../quotes/src/manage-quotes.ts";
import { InMemoryFinanceRepository } from "../finance/src/in-memory-finance-repository.ts";
import { ManageFinance } from "../finance/src/manage-finance.ts";
import { InMemoryWorkshopRepository } from "../workshop/src/in-memory-workshop-repository.ts";
import { ManageWorkshop } from "../workshop/src/manage-workshop.ts";

const tenantId = "11111111-1111-4111-8111-111111111111";
const actorId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const setup = () => {
  const repository = new InMemoryPlatformRepository();
  const audit = new InMemoryAuditSink();
  const application = new PlatformApplication(repository, new AuditRecorder(audit));
  const contexts = new RequestContextResolver(new MapTokenVerifier(new Map([["valid-token", { tenantId, actorId }]])));
  const membership = Membership.create({ tenantId: parseTenantId(tenantId), organizationId: actorId as EntityId, userId: actorId as EntityId, role: "owner", siteIds: [], extraPermissions: [] }).snapshot();
  const authorizer = new RouteAuthorizer(new InMemoryMembershipReader([membership]));
  return { app: buildApp({ application, contexts, authorizer }), repository, audit };
};

test("rejects spoofed or missing tenant context", async () => {
  const { app } = setup();
  const response = await app.inject({ method: "POST", url: "/v1/organizations", payload: { tenantId, legalName: "Injected SAS", displayName: "Injected", countryCode: "FR", activities: ["workshop"] } });
  assert.equal(response.statusCode, 401);
  await app.close();
});

test("executes organization to customer to asset through API v1", async () => {
  const { app, audit } = setup();
  const headers = { authorization: "Bearer valid-token" };
  const organizationResponse = await app.inject({ method: "POST", url: "/v1/organizations", headers, payload: { legalName: "Mobility SAS", displayName: "Mobility", countryCode: "FR", activities: ["vehicle_trade", "workshop"] } });
  assert.equal(organizationResponse.statusCode, 200);
  const organization = organizationResponse.json();
  assert.equal(organization.tenantId, tenantId);

  const customerResponse = await app.inject({ method: "POST", url: "/v1/customers", headers, payload: { kind: "individual", displayName: "Client API", email: "client@example.com", acquisitionChannel: "professional_website", acquisitionOwnerOrganizationId: organization.id } });
  assert.equal(customerResponse.statusCode, 200);
  const customer = customerResponse.json();

  const assetResponse = await app.inject({ method: "POST", url: "/v1/assets", headers, payload: { ownerCustomerId: customer.id, kind: "car", vinOrSerial: "VIN-API-1" } });
  assert.equal(assetResponse.statusCode, 200);
  assert.equal(assetResponse.json().kind, "car");
  assert.equal(audit.entries.length, 3);
  await app.close();
});

test("blocks a role that lacks the route permission", async () => {
  const repository = new InMemoryPlatformRepository();
  const application = new PlatformApplication(repository, new AuditRecorder(new InMemoryAuditSink()));
  const contexts = new RequestContextResolver(new MapTokenVerifier(new Map([["viewer-token", { tenantId, actorId }]])));
  const membership = Membership.create({ tenantId: parseTenantId(tenantId), organizationId: actorId as EntityId, userId: actorId as EntityId, role: "viewer", siteIds: [actorId as EntityId], extraPermissions: [] }).snapshot();
  const app = buildApp({ application, contexts, authorizer: new RouteAuthorizer(new InMemoryMembershipReader([membership])) });
  const response = await app.inject({ method: "POST", url: "/v1/customers", headers: { authorization: "Bearer viewer-token" }, payload: { kind: "individual", displayName: "Blocked user", email: "blocked@example.com", acquisitionChannel: "central_marketplace" } });
  assert.equal(response.statusCode, 403);
  assert.equal(response.json().error, "PERMISSION_DENIED");
  await app.close();
});

test("delivers invitation token out of band and accepts only verified recipient", async () => {
  const repository = new InMemoryPlatformRepository();
  const application = new PlatformApplication(repository, new AuditRecorder(new InMemoryAuditSink()));
  const ownerMembership = Membership.create({ tenantId: parseTenantId(tenantId), organizationId: actorId as EntityId, userId: actorId as EntityId, role: "owner", siteIds: [], extraPermissions: [] }).snapshot();
  const membershipRepository = new InMemoryMembershipRepository([ownerMembership]);
  const notifier = new InMemoryInvitationNotifier();
  const memberships = new ManageMemberships(membershipRepository, notifier);
  const memberId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const contexts = new RequestContextResolver(new MapTokenVerifier(new Map([
    ["owner-token", { tenantId, actorId, email: "owner@example.com" }],
    ["member-token", { tenantId, actorId: memberId, email: "member@example.com" }]
  ])));
  const app = buildApp({ application, contexts, authorizer: new RouteAuthorizer(membershipRepository), modules: { memberships } });
  const invitationResponse = await app.inject({ method: "POST", url: "/v1/membership-invitations", headers: { authorization: "Bearer owner-token" }, payload: { organizationId: actorId, email: "member@example.com", role: "technician", siteIds: [actorId] } });
  assert.equal(invitationResponse.statusCode, 200);
  assert.equal(invitationResponse.body.includes("token"), false);
  assert.equal(notifier.deliveries.length, 1);
  const acceptResponse = await app.inject({ method: "POST", url: "/v1/membership-invitations/accept", headers: { authorization: "Bearer member-token" }, payload: { token: notifier.deliveries[0]!.token } });
  assert.equal(acceptResponse.statusCode, 200);
  assert.equal(acceptResponse.json().userId, memberId);
  await app.close();
});

test("runs the CRM pipeline through HTTP v1 with tenant permissions",async()=>{
  const repository=new InMemoryPlatformRepository(),application=new PlatformApplication(repository,new AuditRecorder(new InMemoryAuditSink()));
  const contexts=new RequestContextResolver(new MapTokenVerifier(new Map([["crm-token",{tenantId,actorId}]])));
  const membership=Membership.create({tenantId:parseTenantId(tenantId),organizationId:actorId as EntityId,userId:actorId as EntityId,role:"owner",siteIds:[],extraPermissions:[]}).snapshot();
  const crm=new ManageCrm(new InMemoryCrmRepository(),()=>new Date("2026-07-19T21:00:00Z"));
  const app=buildApp({application,contexts,authorizer:new RouteAuthorizer(new InMemoryMembershipReader([membership])),modules:{crm}}),headers={authorization:"Bearer crm-token"};
  const pipelineResponse=await app.inject({method:"POST",url:"/v1/crm-pipelines",headers,payload:{organizationId:actorId,activity:"workshop",name:"Demandes atelier",stages:[{key:"new",label:"Nouvelle",order:1},{key:"qualified",label:"Qualifiée",order:2},{key:"won",label:"Gagnée",order:3,terminal:"won"},{key:"lost",label:"Perdue",order:4,terminal:"lost"}]}});
  assert.equal(pipelineResponse.statusCode,200);
  const leadResponse=await app.inject({method:"POST",url:"/v1/opportunities",headers,payload:{organizationId:actorId,siteId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",pipelineId:pipelineResponse.json().id,kind:"service_quote",title:"Révision complète",customerId:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",channel:"professional_website",acquisitionOwnerOrganizationId:actorId,currency:"EUR",metadata:{sourcePage:"atelier"}}});
  assert.equal(leadResponse.statusCode,200);
  const moveResponse=await app.inject({method:"POST",url:`/v1/opportunities/${leadResponse.json().id}/move`,headers,payload:{stageKey:"qualified",providedFields:[]}});
  assert.equal(moveResponse.statusCode,200);assert.equal(moveResponse.json().stageKey,"qualified");
  await app.close();
});

test("queues, dispatches and lists a branded notification through HTTP v1",async()=>{
  const repository=new InMemoryPlatformRepository(),application=new PlatformApplication(repository,new AuditRecorder(new InMemoryAuditSink()));
  const contexts=new RequestContextResolver(new MapTokenVerifier(new Map([["notification-token",{tenantId,actorId}]]))),membership=Membership.create({tenantId:parseTenantId(tenantId),organizationId:actorId as EntityId,userId:actorId as EntityId,role:"owner",siteIds:[],extraPermissions:[]}).snapshot();
  const gateway=new RecordingNotificationGateway(),notifications=new ManageNotifications(new InMemoryNotificationRepository(),{email:gateway},()=>new Date("2026-07-20T09:00:00Z"));
  const app=buildApp({application,contexts,authorizer:new RouteAuthorizer(new InMemoryMembershipReader([membership])),modules:{notifications}}),headers={authorization:"Bearer notification-token"},customerId="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const template=await app.inject({method:"POST",url:"/v1/notification-templates",headers,payload:{organizationId:actorId,key:"appointment.confirmed",locale:"fr-FR",channel:"email",topic:"appointment",subject:"Rendez-vous confirmé",body:"Bonjour {{name}}, votre rendez-vous est confirmé."}});assert.equal(template.statusCode,200);
  const queued=await app.inject({method:"POST",url:"/v1/notifications",headers,payload:{organizationId:actorId,customerId,templateKey:"appointment.confirmed",topic:"appointment",locale:"fr-FR",channels:["email"],addresses:{email:"client@example.com"},variables:{name:"Alice"},brand:{name:"Garage Central",primaryColor:"#e1121a"},idempotencyKey:"booking:100:confirmed"}});assert.equal(queued.statusCode,200);
  const dispatch=await app.inject({method:"POST",url:`/v1/notifications/${queued.json()[0].id}/dispatch`,headers});assert.equal(dispatch.json().status,"sent");
  const history=await app.inject({method:"GET",url:`/v1/customers/${customerId}/notifications`,headers});assert.equal(history.statusCode,200);assert.equal(history.json()[0].brandName,"Garage Central");assert.equal(gateway.sent.length,1);await app.close();
});

test("starts and advances a workflow through HTTP v1",async()=>{
  const repository=new InMemoryPlatformRepository(),application=new PlatformApplication(repository,new AuditRecorder(new InMemoryAuditSink())),contexts=new RequestContextResolver(new MapTokenVerifier(new Map([["workflow-token",{tenantId,actorId}]]))),membership=Membership.create({tenantId:parseTenantId(tenantId),organizationId:actorId as EntityId,userId:actorId as EntityId,role:"owner",siteIds:[],extraPermissions:[]}).snapshot(),workflows=new ManageWorkflows(new InMemoryWorkflowRepository(),()=>new Date("2026-07-20T11:00:00Z"));
  const app=buildApp({application,contexts,authorizer:new RouteAuthorizer(new InMemoryMembershipReader([membership])),modules:{workflows}}),headers={authorization:"Bearer workflow-token"};
  const definition=await app.inject({method:"POST",url:"/v1/workflow-definitions",headers,payload:{organizationId:actorId,activity:"workshop",key:"workshop.order",name:"Ordre atelier",steps:[{key:"intake",label:"Réception",order:1,defaultRole:"advisor",slaMinutes:30},{key:"diagnosis",label:"Diagnostic",order:2,requiredFields:["mileage"]},{key:"done",label:"Terminé",order:3,terminal:true}]}});assert.equal(definition.statusCode,200);
  const started=await app.inject({method:"POST",url:"/v1/workflows",headers,payload:{organizationId:actorId,siteId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",definitionId:definition.json().id,subjectType:"work_order",subjectId:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",priority:"high",data:{}}});assert.equal(started.statusCode,200);
  const moved=await app.inject({method:"POST",url:`/v1/workflows/${started.json().id}/transition`,headers,payload:{to:"diagnosis",expectedVersion:1,fields:{mileage:90000}}});assert.equal(moved.statusCode,200);assert.equal(moved.json().stepKey,"diagnosis");
  const queue=await app.inject({method:"GET",url:"/v1/work-items?assignedRole=advisor",headers});assert.equal(queue.statusCode,200);assert.equal(queue.json().length,0);await app.close();
});

test("creates, sends and accepts an exact quote through HTTP v1",async()=>{
  const repository=new InMemoryPlatformRepository(),application=new PlatformApplication(repository,new AuditRecorder(new InMemoryAuditSink())),contexts=new RequestContextResolver(new MapTokenVerifier(new Map([["quote-token",{tenantId,actorId}]]))),membership=Membership.create({tenantId:parseTenantId(tenantId),organizationId:actorId as EntityId,userId:actorId as EntityId,role:"owner",siteIds:[],extraPermissions:[]}).snapshot(),quotes=new ManageQuotes(new InMemoryQuoteRepository(),()=>new Date("2026-07-20T13:00:00Z"));
  const app=buildApp({application,contexts,authorizer:new RouteAuthorizer(new InMemoryMembershipReader([membership])),modules:{quotes}}),headers={authorization:"Bearer quote-token"},customerId="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const created=await app.inject({method:"POST",url:"/v1/quotes",headers,payload:{organizationId:actorId,siteId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",customerId,lines:[{kind:"service",label:"Révision complète",quantity:1,unitPriceCents:10000}],policy:{currency:"EUR",taxRateBasisPoints:2000,maxDiscountBasisPoints:1000,minimumMarginBasisPoints:0,validityDays:30},terms:"Validité 30 jours"}});assert.equal(created.statusCode,200);assert.equal(created.json().totalCents,12000);
  const sent=await app.inject({method:"POST",url:`/v1/quotes/${created.json().id}/send`,headers});assert.equal(sent.json().status,"sent");
  const accepted=await app.inject({method:"POST",url:`/v1/quotes/${created.json().id}/accept`,headers,payload:{customerId,expectedTotalCents:sent.json().totalCents,termsHash:sent.json().termsHash}});assert.equal(accepted.statusCode,200);assert.equal(accepted.json().status,"accepted");await app.close();
});

test("creates an order, invoice and partial payment through HTTP v1",async()=>{
  const repository=new InMemoryPlatformRepository(),application=new PlatformApplication(repository,new AuditRecorder(new InMemoryAuditSink())),contexts=new RequestContextResolver(new MapTokenVerifier(new Map([["finance-token",{tenantId,actorId}]]))),membership=Membership.create({tenantId:parseTenantId(tenantId),organizationId:actorId as EntityId,userId:actorId as EntityId,role:"owner",siteIds:[],extraPermissions:[]}).snapshot(),financeRepository=new InMemoryFinanceRepository(),finance=new ManageFinance(financeRepository,()=>new Date("2026-07-20T15:00:00Z"));
  const app=buildApp({application,contexts,authorizer:new RouteAuthorizer(new InMemoryMembershipReader([membership])),modules:{finance}}),headers={authorization:"Bearer finance-token"};
  const order=await app.inject({method:"POST",url:"/v1/orders",headers,payload:{organizationId:actorId,siteId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",customerId:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",quoteId:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",quoteStatus:"accepted",currency:"EUR",totalCents:12000}});assert.equal(order.statusCode,200);
  const invoice=await app.inject({method:"POST",url:"/v1/invoices",headers,payload:{orderId:order.json().id,paymentTermsDays:30}});assert.equal(invoice.statusCode,200);
  const payment=await app.inject({method:"POST",url:"/v1/payments",headers,payload:{invoiceId:invoice.json().id,provider:"stripe",providerReference:"pi_api",idempotencyKey:"evt_api",amountCents:5000,currency:"EUR",method:"card"}});assert.equal(payment.statusCode,200);assert.equal(financeRepository.invoices[0]!.balanceCents,7000);await app.close();
});

test("runs a work order from check-in to vehicle release through HTTP v1",async()=>{
  const repository=new InMemoryPlatformRepository(),application=new PlatformApplication(repository,new AuditRecorder(new InMemoryAuditSink())),contexts=new RequestContextResolver(new MapTokenVerifier(new Map([["workshop-token",{tenantId,actorId}]]))),membership=Membership.create({tenantId:parseTenantId(tenantId),organizationId:actorId as EntityId,userId:actorId as EntityId,role:"owner",siteIds:[],extraPermissions:[]}).snapshot(),workshop=new ManageWorkshop(new InMemoryWorkshopRepository(),()=>new Date("2026-07-20T17:00:00Z"));
  const app=buildApp({application,contexts,authorizer:new RouteAuthorizer(new InMemoryMembershipReader([membership])),modules:{workshop}}),headers={authorization:"Bearer workshop-token"};
  const created=await app.inject({method:"POST",url:"/v1/work-orders",headers,payload:{organizationId:actorId,siteId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",customerId:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",assetId:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",checkIn:{mileage:80000,fuelLevelPercent:50,customerConcerns:["Voyant moteur"],photoDocumentIds:[],keysReceived:1}}});assert.equal(created.statusCode,200);const id=created.json().id;
  await app.inject({method:"POST",url:`/v1/work-orders/${id}/diagnose`,headers});const added=await app.inject({method:"POST",url:`/v1/work-orders/${id}/jobs`,headers,payload:{label:"Diagnostic électronique",kind:"diagnostic",estimatedMinutes:30,approvalRequired:false}}),jobId=added.json().id;
  await app.inject({method:"POST",url:`/v1/work-orders/${id}/jobs/start`,headers,payload:{jobId,technicianId:actorId}});await app.inject({method:"POST",url:`/v1/work-orders/${id}/jobs/complete`,headers,payload:{jobId,diagnosis:"Capteur contrôlé"}});await app.inject({method:"POST",url:`/v1/work-orders/${id}/quality-control`,headers});await app.inject({method:"POST",url:`/v1/work-orders/${id}/quality-approve`,headers,payload:{notes:"Essai conforme"}});const released=await app.inject({method:"POST",url:`/v1/work-orders/${id}/release`,headers});assert.equal(released.statusCode,200);await app.close();
});
