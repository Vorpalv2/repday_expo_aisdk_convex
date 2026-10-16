import {billingRequest} from '../billing';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './client';
import { restDayKey } from '../../lib/restDays';
import { DEFAULT_PLAN_CATALOG, planCatalogSchema, type PlanCatalog, type GeneratedPlan } from '../../lib/trainingPlan';

export async function loadPlanCatalog(): Promise<PlanCatalog> {
  if(!db||!auth?.currentUser)return DEFAULT_PLAN_CATALOG;
  try {
    const snapshot=await getDoc(doc(db,'planTemplates','catalog-v1'));
    if(!snapshot.exists())return DEFAULT_PLAN_CATALOG;
    return planCatalogSchema.parse(snapshot.data());
  } catch {
    // Keep onboarding available offline with the same versioned catalog.
    return DEFAULT_PLAN_CATALOG;
  }
}

// One atomic write installs independent copies and changes the weekly schedule.
// Retrying the same preview uses the same IDs, without duplicate splits.
export async function installTrainingPlan(plan:GeneratedPlan, positionOffset=0, startTrackingTimeZone?:string):Promise<void> {
  const uid=auth?.currentUser?.uid;
  if(!uid||!db)throw new Error('Sign in before saving your plan.');
  const now=Date.now();
  await billingRequest('/api/splits',{items:plan.sessions.map((item,index)=>({item,position:positionOffset+index})),settings:{...(startTrackingTimeZone?{autoRestStartedAt:now,autoRestNextDate:restDayKey(now,startTrackingTimeZone)}:{}),initialized:true,weeklyPlan:plan.weeklyPlan,focusDraft:null,selectedSessionId:plan.sessions[0].id,guidedPlan:{id:plan.id,templateId:plan.templateId,templateVersion:plan.templateVersion,preferences:plan.preferences,createdAt:now},updatedAt:now}});
}
