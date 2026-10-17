import {z} from 'zod';
import {billingEnforced,hasPlusAccess} from './billing';
import {documentDelete,documentWrite,inTransaction,listDocuments,readDocument,ServerError} from './firebaseAdmin';
import {FREE_SPLIT_LIMIT} from '../billingTypes';
import {stableSerialize} from '../stableSerialize';
const set=z.object({weight:z.string().max(30),reps:z.string().max(30),done:z.boolean().optional()}).passthrough();
const move=z.object({name:z.string().min(1).max(500),sets:z.array(set).max(100)}).passthrough();
const session=z.object({id:z.string().min(1).max(200).refine(value=>value!=='.'&&value!=='..'&&!/^__.*__$/.test(value)),name:z.string().min(1).max(500),moves:z.array(move).max(100)}).passthrough();
export const splitRequest=z.object({items:z.array(z.object({item:session,position:z.number().int().min(0).max(10000),resetTargets:z.boolean().optional()})).max(200),replace:z.boolean().optional(),planMode:z.enum(['onboarding','rebuild']).optional(),settings:z.object({initialized:z.literal(true),weeklyPlan:z.record(z.string(),z.string().nullable()),focusDraft:z.null(),selectedSessionId:z.string(),trainingGoal:z.enum(['strength','muscle','fitness','endurance']).optional(),guidedPlan:z.record(z.string(),z.unknown()),autoRestStartedAt:z.number().optional(),autoRestNextDate:z.string().optional(),updatedAt:z.number()}).optional()});
export function validateSplitQuota(existing:string[],requested:string[],replace:boolean,premium:boolean,enforced:boolean){
 if(new Set(requested).size!==requested.length)throw new ServerError(400,'Duplicate split IDs.');
 const creates=requested.some(id=>!existing.includes(id));
 const finalCount=replace?requested.length:new Set([...existing,...requested]).size;
 if(enforced&&!premium&&creates&&finalCount>FREE_SPLIT_LIMIT)throw new ServerError(402,'Free accounts can save up to 6 splits. Open Profile to try Repday Plus.');
}
export function splitNeedsWrite(existing:Record<string,any>|undefined,item:Record<string,any>,position:number,resetTargets=false){
 return !existing||existing.clientId!==item.id||existing.position!==position||
  stableSerialize(existing.data)!==stableSerialize(item)||
  (resetTargets&&stableSerialize(existing.setTargets??{})!==stableSerialize({}));
}
export async function saveSplits(uid:string,body:unknown){
 const parsed=splitRequest.safeParse(body);if(!parsed.success)throw new ServerError(400,'Invalid workout splits. Check exercise names, weights and reps.');
  const {items,replace=false,settings,planMode}=parsed.data;
 return inTransaction(async transaction=>{
  const quota=await readDocument(`splitQuotas/${uid}`,transaction);
  const account=await readDocument(`billingAccounts/${uid}`,transaction);
  if((account?.deletingUntil||0)>Date.now())throw new ServerError(409,'Account deletion is in progress.');
  const effectivePlanMode=planMode??(settings?(settings.autoRestStartedAt?'onboarding':'rebuild'):undefined);
  if(effectivePlanMode==='rebuild'&&billingEnforced()&&!hasPlusAccess(account))throw new ServerError(402,'Repday Plus is required to rebuild a training plan.');
  const ids=items.map(({item})=>encodeURIComponent(item.id));
  // Editing one existing split does not need to read the entire split library.
  const singleExisting=!replace&&ids.length===1
   ?await readDocument(`users/${uid}/splits/${ids[0]}`,transaction)
   :null;
  const existing=singleExisting
   ?[{id:ids[0],data:singleExisting}]
   :await listDocuments(`users/${uid}`,'splits',transaction);
  const existingById=new Map(existing.map(row=>[row.id,row.data]));
  validateSplitQuota(existing.map(row=>row.id),ids,replace,hasPlusAccess(account),billingEnforced());
  const writes:any[]=[];
  if(replace)for(const row of existing)if(!ids.includes(row.id))writes.push(documentDelete(`users/${uid}/splits/${row.id}`));
  for(const {item,position,resetTargets} of items){
   if(!splitNeedsWrite(existingById.get(encodeURIComponent(item.id)),item,position,resetTargets))continue;
   writes.push(documentWrite(`users/${uid}/splits/${encodeURIComponent(item.id)}`,{clientId:item.id,data:item,position,...(resetTargets?{setTargets:{}}:{}),updatedAt:Date.now()},true));
  }
  if(settings)writes.push(documentWrite(`users/${uid}/settings/main`,settings,true));
  if(writes.length)writes.unshift(documentWrite(`splitQuotas/${uid}`,{revision:(quota?.revision||0)+1}));
  return {result:{saved:items.length},writes};
 });
}
