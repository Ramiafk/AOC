import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { invariant } from "../../core/src/errors.ts";
import { newEntityId, type EntityId, type TenantScoped } from "../../core/src/identity.ts";

export type PassportEntryType = "maintenance" | "repair" | "inspection" | "body_work" | "tyres" | "battery" | "ownership" | "document" | "custom";
export type EntryVisibility = "owner_only" | "shared_professionals" | "resale_public";
export type DeadlineType = "maintenance" | "technical_inspection" | "insurance" | "warranty" | "registration" | "lease" | "custom";

export interface PassportProps extends TenantScoped { id: EntityId; assetId: EntityId; ownerCustomerId: EntityId; status: "active" | "archived"; createdAt: string }
export class Passport {
  private readonly props: PassportProps;
  private constructor(props: PassportProps){this.props=props;}
  static create(input: Omit<PassportProps,"id"|"status"|"createdAt">,now=new Date()):Passport{return new Passport({...input,id:newEntityId(),status:"active",createdAt:now.toISOString()});}
  snapshot():Readonly<PassportProps>{return this.props;}
}

export interface PassportEntryProps extends TenantScoped { id:EntityId; passportId:EntityId; assetId:EntityId; type:PassportEntryType; title:string; occurredAt:string; mileage?:number|undefined; providerOrganizationId?:EntityId|undefined; documentIds:readonly EntityId[]; visibility:EntryVisibility; evidenceHash?:string|undefined; createdBy:EntityId; createdAt:string }
export class PassportEntry {
  private readonly props:PassportEntryProps;
  private constructor(props:PassportEntryProps){this.props=props;}
  static create(input:Omit<PassportEntryProps,"id"|"createdAt"|"evidenceHash">,now=new Date()):PassportEntry{
    invariant(input.title.trim().length>=2,"PASSPORT_ENTRY_TITLE_REQUIRED","Entry title is required");
    invariant(new Date(input.occurredAt)<=now,"PASSPORT_ENTRY_IN_FUTURE","History entry cannot be in the future");
    invariant(input.mileage===undefined||input.mileage>=0,"INVALID_MILEAGE","Mileage cannot be negative");
    const evidenceHash=input.documentIds.length?createHash("sha256").update([...input.documentIds].sort().join(":" )).digest("hex"):undefined;
    return new PassportEntry({...input,id:newEntityId(),title:input.title.trim(),documentIds:Object.freeze([...new Set(input.documentIds)]),evidenceHash,createdAt:now.toISOString()});
  }
  snapshot():Readonly<PassportEntryProps>{return this.props;}
}

export interface DeadlineProps extends TenantScoped { id:EntityId; passportId:EntityId; assetId:EntityId; type:DeadlineType; label:string; dueAt:string; dueMileage?:number|undefined; status:"scheduled"|"completed"|"dismissed"; sourceEntryId?:EntityId|undefined; createdAt:string }
export class Deadline {
  private props:DeadlineProps;
  private constructor(props:DeadlineProps){this.props=props;}
  static create(input:Omit<DeadlineProps,"id"|"status"|"createdAt">,now=new Date()):Deadline{invariant(new Date(input.dueAt)>now,"DEADLINE_MUST_BE_FUTURE","Deadline must be in the future");invariant(input.label.trim().length>=2,"DEADLINE_LABEL_REQUIRED","Deadline label is required");return new Deadline({...input,id:newEntityId(),label:input.label.trim(),status:"scheduled",createdAt:now.toISOString()});}
  complete():void{invariant(this.props.status==="scheduled","DEADLINE_NOT_ACTIVE","Deadline is not active");this.props={...this.props,status:"completed"};}
  snapshot():Readonly<DeadlineProps>{return this.props;}
}

export type QrPurpose="owner_portal"|"booking"|"service_intake"|"resale_view";
export interface QrGrantProps extends TenantScoped { id:EntityId; passportId:EntityId; purpose:QrPurpose; tokenHash:string; expiresAt:string; maxUses:number; useCount:number; revokedAt?:string|undefined; createdBy:EntityId; createdAt:string }
export class QrGrant {
  private props:QrGrantProps;
  private constructor(props:QrGrantProps){this.props=props;}
  static issue(input:Omit<QrGrantProps,"id"|"tokenHash"|"expiresAt"|"useCount"|"revokedAt"|"createdAt">&{ttlMinutes:number},now=new Date()):{grant:QrGrant;token:string}{invariant(input.ttlMinutes>=5&&input.ttlMinutes<=525600,"INVALID_QR_TTL","QR validity is invalid");invariant(input.maxUses>=1,"INVALID_QR_MAX_USES","QR must allow at least one use");const token=randomBytes(32).toString("base64url");const {ttlMinutes,...base}=input;return{token,grant:new QrGrant({...base,id:newEntityId(),tokenHash:QrGrant.hash(token),expiresAt:new Date(now.getTime()+ttlMinutes*60000).toISOString(),useCount:0,createdAt:now.toISOString()})};}
  static restore(props:QrGrantProps):QrGrant{return new QrGrant(props);}
  static hash(token:string):string{return createHash("sha256").update(token).digest("hex");}
  consume(token:string,now=new Date()):void{invariant(!this.props.revokedAt,"QR_REVOKED","QR access was revoked");invariant(now<new Date(this.props.expiresAt),"QR_EXPIRED","QR access has expired");invariant(this.props.useCount<this.props.maxUses,"QR_USAGE_LIMIT","QR usage limit reached");const expected=Buffer.from(this.props.tokenHash,"hex");const provided=Buffer.from(QrGrant.hash(token),"hex");invariant(expected.length===provided.length&&timingSafeEqual(expected,provided),"INVALID_QR_TOKEN","QR token is invalid");this.props={...this.props,useCount:this.props.useCount+1};}
  revoke(now=new Date()):void{this.props={...this.props,revokedAt:now.toISOString()};}
  snapshot():Readonly<QrGrantProps>{return this.props;}
}
