import type { EntityId,TenantId } from "../../core/src/identity.ts";
import type { PassportRepository,ReminderProps } from "./manage-passports.ts";
import type { DeadlineProps,PassportEntryProps,PassportProps,QrGrantProps } from "./passport.ts";
export class InMemoryPassportRepository implements PassportRepository{
  readonly passports=new Map<string,Readonly<PassportProps>>();readonly entries:Readonly<PassportEntryProps>[]=[];readonly deadlines:Readonly<DeadlineProps>[]=[];readonly grants=new Map<string,Readonly<QrGrantProps>>();readonly reminders:ReminderProps[]=[];
  private key(t:TenantId,id:string){return `${t}:${id}`;}
  async savePassport(v:Readonly<PassportProps>){this.passports.set(this.key(v.tenantId,v.assetId),v);}async findPassportByAsset(t:TenantId,a:EntityId){return this.passports.get(this.key(t,a))??null;}
  async saveEntry(v:Readonly<PassportEntryProps>){(this.entries as PassportEntryProps[]).push(v);}async saveDeadline(v:Readonly<DeadlineProps>){(this.deadlines as DeadlineProps[]).push(v);}
  async saveGrant(v:Readonly<QrGrantProps>){this.grants.set(this.key(v.tenantId,v.tokenHash),v);}async findGrantByHash(t:TenantId,h:string){return this.grants.get(this.key(t,h))??null;}async updateGrant(v:Readonly<QrGrantProps>){this.grants.set(this.key(v.tenantId,v.tokenHash),v);}
  async listDueDeadlines(t:TenantId,before:string){return this.deadlines.filter(v=>v.tenantId===t&&v.status==="scheduled"&&v.dueAt<=before);}async hasReminder(t:TenantId,d:EntityId,w:number){return this.reminders.some(v=>v.tenantId===t&&v.deadlineId===d&&v.windowDays===w);}async saveReminder(v:ReminderProps){this.reminders.push(v);}
}
