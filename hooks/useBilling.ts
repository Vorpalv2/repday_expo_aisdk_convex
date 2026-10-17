import {useCallback,useEffect,useRef,useState} from 'react';
import {AppState} from 'react-native';
import {billingRequest,BillingApiError} from '../backend/billing';
import type {BillingStatus} from '../lib/billingTypes';
const BILLING_REFRESH_MS=4*60*60*1000;
export function useBilling(uid:string|null){
 const [record,setRecord]=useState<{uid:string;value:BillingStatus}|null>(null),[error,setError]=useState('');
 const recordRef=useRef<{uid:string;value:BillingStatus}|null>(null);recordRef.current=record;
 const owner=useRef(uid);owner.current=uid;
 const lastChecked=useRef<{uid:string;at:number}|null>(null);
 const pending=useRef<{uid:string;request:Promise<BillingStatus>;reconcile:boolean}|null>(null);
 const accept=useCallback((value:BillingStatus)=>{if(uid&&owner.current===uid){lastChecked.current={uid,at:Date.now()};setRecord({uid,value});}},[uid]);
 const refresh=useCallback(async(reconcile=false)=>{if(!uid)return null;if(pending.current?.uid===uid){if(!reconcile||pending.current.reconcile)return pending.current.request;await pending.current.request.catch(()=>{});}const request=(async()=>{let lastError:unknown;for(let attempt=0;attempt<3;attempt+=1){try{return await billingRequest<BillingStatus>(reconcile?'/api/billing/refresh':'/api/billing',reconcile?{}:undefined);}catch(error){lastError=error;if(!(error instanceof BillingApiError)||error.status!==503||attempt===2)throw error;await new Promise<void>(resolve=>setTimeout(resolve,1500*(attempt+1)));}}throw lastError;})();pending.current={uid,request,reconcile};try{const value=await request;if(owner.current===uid){accept(value);setError('');}return value;}catch(error){if(owner.current===uid){if(recordRef.current?.uid!==uid)setError(error instanceof Error?error.message:'Could not load your subscription.');else setError('');}throw error;}finally{if(pending.current?.request===request)pending.current=null;}},[uid,accept]);
 useEffect(()=>{setError('');if(!uid)return;void refresh().catch(()=>{});const refreshIfDue=()=>{if(lastChecked.current?.uid!==uid||Date.now()-lastChecked.current.at>=BILLING_REFRESH_MS)void refresh().catch(()=>{});};const interval=setInterval(refreshIfDue,BILLING_REFRESH_MS);const listener=AppState.addEventListener('change',state=>{if(state==='active')refreshIfDue();});return()=>{clearInterval(interval);listener.remove();};},[uid,refresh]);
 useEffect(()=>{const until=record?.uid===uid?record.value.paidUntil:null;if(!until||!record?.value.premium||record.value.accessSource==='manual')return;let timer:ReturnType<typeof setTimeout>;const check=()=>{const left=until-Date.now();if(left>0){timer=setTimeout(check,Math.min(left,2147483647));return;}setRecord(current=>current?.uid===uid?{...current,value:{...current.value,premium:false,splitLimit:6,accessSource:null}}:current);void refresh().catch(()=>{});};check();return()=>clearTimeout(timer);},[uid,record?.value.paidUntil,record?.value.premium,record?.value.accessSource,refresh]);
 const refreshAccess=useCallback(()=>refresh(true),[refresh]);
 return {status:record?.uid===uid?record.value:null,error,refresh,refreshAccess,accept};
}
