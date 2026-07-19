import { invariant } from "../../core/src/errors.ts";
import { newEntityId, type EntityId, type TenantScoped } from "../../core/src/identity.ts";

export type NotificationChannel = "email" | "sms" | "push" | "in_app";
export type NotificationTopic = "appointment" | "service" | "document" | "passport" | "security" | "marketing";
export type NotificationStatus = "queued" | "sent" | "failed" | "cancelled";

export interface MessageTemplateProps extends TenantScoped {
  id: EntityId; organizationId: EntityId; key: string; locale: string; channel: NotificationChannel;
  topic: NotificationTopic; subject?: string | undefined; body: string; active: boolean; createdAt: string;
}

export class MessageTemplate {
  static create(input: Omit<MessageTemplateProps,"id"|"active"|"createdAt">,now=new Date()): MessageTemplateProps {
    invariant(/^[a-z0-9_.-]{2,80}$/.test(input.key),"INVALID_TEMPLATE_KEY","Template key is invalid");
    invariant(input.body.trim().length>=2,"TEMPLATE_BODY_REQUIRED","Template body is required");
    invariant(input.channel!=="email"||Boolean(input.subject?.trim()),"EMAIL_SUBJECT_REQUIRED","Email subject is required");
    return {...input,id:newEntityId(),body:input.body.trim(),subject:input.subject?.trim(),active:true,createdAt:now.toISOString()};
  }
}

export interface NotificationPreferenceProps extends TenantScoped {
  customerId: EntityId; topic: NotificationTopic; enabledChannels: readonly NotificationChannel[];
  marketingConsent: boolean; locale: string; timezone: string; updatedAt: string;
}

export interface NotificationProps extends TenantScoped {
  id: EntityId; organizationId: EntityId; customerId: EntityId; templateId: EntityId;
  channel: NotificationChannel; topic: NotificationTopic; recipient?: string | undefined;
  subject?: string | undefined; body: string; brandName: string; brandPrimaryColor: string;
  idempotencyKey: string; status: NotificationStatus; attempts: number;
  providerMessageId?: string | undefined; lastError?: string | undefined; createdAt: string; sentAt?: string | undefined;
}

export class Notification {
  private props:NotificationProps;
  private constructor(props: NotificationProps) { this.props=props; }
  static queue(input: Omit<NotificationProps,"id"|"status"|"attempts"|"providerMessageId"|"lastError"|"createdAt"|"sentAt">,now=new Date()) {
    invariant(input.channel==="in_app"||Boolean(input.recipient?.trim()),"NOTIFICATION_RECIPIENT_REQUIRED","A recipient is required");
    invariant(input.body.trim().length>0,"NOTIFICATION_BODY_REQUIRED","Notification body is required");
    invariant(/^#[0-9a-f]{6}$/i.test(input.brandPrimaryColor),"INVALID_BRAND_COLOR","Brand color is invalid");
    return new Notification({...input,id:newEntityId(),recipient:input.recipient?.trim(),body:input.body.trim(),status:"queued",attempts:0,createdAt:now.toISOString()});
  }
  static restore(props: NotificationProps) { return new Notification(props); }
  sent(providerMessageId:string,now=new Date()) { invariant(this.props.status==="queued"||this.props.status==="failed","NOTIFICATION_NOT_DISPATCHABLE","Notification cannot be dispatched"); this.props={...this.props,status:"sent",attempts:this.props.attempts+1,providerMessageId,sentAt:now.toISOString(),lastError:undefined}; }
  failed(error:string) { invariant(this.props.status!=="sent","NOTIFICATION_ALREADY_SENT","Sent notification cannot fail"); this.props={...this.props,status:"failed",attempts:this.props.attempts+1,lastError:error.slice(0,500)}; }
  snapshot() { return this.props; }
}

export function renderTemplate(value:string,variables:Readonly<Record<string,string|number>>):string {
  return value.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g,(_match,key:string)=>{
    invariant(Object.hasOwn(variables,key),"TEMPLATE_VARIABLE_MISSING",`Template variable ${key} is missing`);
    return String(variables[key]);
  });
}
