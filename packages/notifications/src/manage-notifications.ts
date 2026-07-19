import { invariant } from "../../core/src/errors.ts";
import type { EntityId, RequestContext, TenantId } from "../../core/src/identity.ts";
import { MessageTemplate, Notification, renderTemplate, type MessageTemplateProps, type NotificationChannel, type NotificationPreferenceProps, type NotificationProps, type NotificationTopic } from "./notification.ts";

export interface NotificationRepository {
  saveTemplate(value:Readonly<MessageTemplateProps>):Promise<void>;
  findTemplate(tenantId:TenantId,organizationId:EntityId,key:string,locale:string,channel:NotificationChannel):Promise<Readonly<MessageTemplateProps>|null>;
  savePreference(value:Readonly<NotificationPreferenceProps>):Promise<void>;
  findPreference(tenantId:TenantId,customerId:EntityId,topic:NotificationTopic):Promise<Readonly<NotificationPreferenceProps>|null>;
  saveNotification(value:Readonly<NotificationProps>):Promise<void>;
  findNotification(tenantId:TenantId,id:EntityId):Promise<Readonly<NotificationProps>|null>;
  findByIdempotencyKey(tenantId:TenantId,key:string,channel:NotificationChannel):Promise<Readonly<NotificationProps>|null>;
  listForCustomer(tenantId:TenantId,customerId:EntityId):Promise<readonly Readonly<NotificationProps>[]>;
}
export interface NotificationGateway { send(value:Readonly<NotificationProps>):Promise<{providerMessageId:string}> }
export interface RecipientAddresses { email?:string|undefined;sms?:string|undefined;push?:string|undefined }
export interface BrandSnapshot { name:string;primaryColor:string }

export class ManageNotifications {
  private readonly repository:NotificationRepository;private readonly gateways:Partial<Record<NotificationChannel,NotificationGateway>>;private readonly now:()=>Date;
  constructor(repository:NotificationRepository,gateways:Partial<Record<NotificationChannel,NotificationGateway>>,now=()=>new Date()){this.repository=repository;this.gateways=gateways;this.now=now;}
  async scopeForNotification(context:RequestContext,id:EntityId){const value=await this.repository.findNotification(context.tenantId,id);invariant(value,"NOTIFICATION_NOT_FOUND","Notification was not found");return{organizationId:value.organizationId};}
  async createTemplate(context:RequestContext,input:Omit<MessageTemplateProps,"id"|"tenantId"|"active"|"createdAt">){const value=MessageTemplate.create({tenantId:context.tenantId,...input},this.now());await this.repository.saveTemplate(value);return value;}
  async setPreference(context:RequestContext,input:Omit<NotificationPreferenceProps,"tenantId"|"updatedAt">){invariant(input.topic!=="marketing"||input.marketingConsent,"MARKETING_CONSENT_REQUIRED","Marketing requires explicit consent");const value:NotificationPreferenceProps={tenantId:context.tenantId,...input,enabledChannels:Object.freeze([...new Set(input.enabledChannels)]),updatedAt:this.now().toISOString()};await this.repository.savePreference(value);return value;}
  async queue(context:RequestContext,input:{organizationId:EntityId;customerId:EntityId;templateKey:string;topic:NotificationTopic;locale:string;channels:readonly NotificationChannel[];addresses:RecipientAddresses;variables:Readonly<Record<string,string|number>>;brand:BrandSnapshot;idempotencyKey:string}){
    const preference=await this.repository.findPreference(context.tenantId,input.customerId,input.topic);
    if(input.topic==="marketing")invariant(preference?.marketingConsent,"MARKETING_CONSENT_REQUIRED","Marketing requires explicit consent");
    const allowed=input.channels.filter(channel=>!preference||preference.enabledChannels.includes(channel));const created:NotificationProps[]=[];
    for(const channel of allowed){const existing=await this.repository.findByIdempotencyKey(context.tenantId,input.idempotencyKey,channel);if(existing){created.push(existing);continue;}const template=await this.repository.findTemplate(context.tenantId,input.organizationId,input.templateKey,input.locale,channel);invariant(template?.active,"NOTIFICATION_TEMPLATE_NOT_FOUND",`Active ${channel} template was not found`);const recipient=channel==="email"?input.addresses.email:channel==="sms"?input.addresses.sms:channel==="push"?input.addresses.push:undefined;const notification=Notification.queue({tenantId:context.tenantId,organizationId:input.organizationId,customerId:input.customerId,templateId:template.id,channel,topic:input.topic,recipient,subject:template.subject?renderTemplate(template.subject,input.variables):undefined,body:renderTemplate(template.body,input.variables),brandName:input.brand.name,brandPrimaryColor:input.brand.primaryColor,idempotencyKey:input.idempotencyKey},this.now()).snapshot();await this.repository.saveNotification(notification);created.push(notification);}return created;
  }
  async dispatch(context:RequestContext,id:EntityId){const stored=await this.repository.findNotification(context.tenantId,id);invariant(stored,"NOTIFICATION_NOT_FOUND","Notification was not found");if(stored.status==="sent")return stored;const gateway=this.gateways[stored.channel];invariant(gateway,"NOTIFICATION_GATEWAY_UNAVAILABLE","Notification gateway is unavailable");const value=Notification.restore({...stored});try{const result=await gateway.send(stored);value.sent(result.providerMessageId,this.now());}catch(error){value.failed(error instanceof Error?error.message:"Provider failure");}await this.repository.saveNotification(value.snapshot());return value.snapshot();}
  async listForCustomer(context:RequestContext,customerId:EntityId){return this.repository.listForCustomer(context.tenantId,customerId);}
}
