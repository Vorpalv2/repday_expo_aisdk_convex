import {useCallback,useEffect,useRef,useState} from 'react';
import {AppState} from 'react-native';
import {billingRequest} from '../backend/billing';
import type {BillingStatus} from '../lib/billingTypes';
const BILLING_REFRESH_MS=4*60*60*1000;
export function useBilling(uid:string|null){
 const [record,setRecord]=useState<{uid:string;value:BillingStatus}|null>(null),[error,setError]=useState('');
 const owner=useRef(uid);owner.current=uid;
 const lastChecked=useRef<{uid:string;at:number}|null>(null);
 const pending=useRef<{uid:string;request:Promise<BillingStatus>}|null>(null);
 const accept=useCallback((value:BillingStatus)=>{if(uid&&owner.current===uid){lastChecked.current={uid,at:Date.now()};setRecord({uid,value});}},[uid]);
 const refresh=useCallback(async()=>{if(!uid)return null;if(pending.current?.uid===uid)return pending.current.request;const request=billingRequest<BillingStatus>('/api/billing');pending.current={uid,request};try{const value=await request;if(owner.current===uid){accept(value);setError('');}return value;}catch(error){if(owner.current===uid)setError(error instanceof Error?error.message:'Could not load your subscription.');throw error;}finally{if(pending.current?.request===request)pending.current=null;}},[uid,accept]);
 useEffect(()=>{setError('');if(!uid)return;void refresh().catch(()=>{});const refreshIfDue=()=>{if(lastChecked.current?.uid!==uid||Date.now()-lastChecked.current.at>=BILLING_REFRESH_MS)void refresh().catch(()=>{});};const interval=setInterval(refreshIfDue,BILLING_REFRESH_MS);const listener=AppState.addEventListener('change',state=>{if(state==='active')refreshIfDue();});return()=>{clearInterval(interval);listener.remove();};},[uid,refresh]);
 useEffect(()=>{const until=record?.uid===uid?record.value.paidUntil:null;if(!until||!record?.value.premium||record.value.accessSource==='manual')return;let timer:ReturnType<typeof setTimeout>;const check=()=>{const left=until-Date.now();if(left>0){timer=setTimeout(check,Math.min(left,2147483647));return;}setRecord(current=>current?.uid===uid?{...current,value:{...current.value,premium:false,splitLimit:6,accessSource:null}}:current);void refresh().catch(()=>{});};check();return()=>clearTimeout(timer);},[uid,record?.value.paidUntil,record?.value.premium,record?.value.accessSource,refresh]);
 return {status:record?.uid===uid?record.value:null,error,refresh,accept};
}
