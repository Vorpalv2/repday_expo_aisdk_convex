import {collection,doc,getDocsFromServer,limit,orderBy,query,runTransaction,startAfter,type DocumentData,type QueryDocumentSnapshot} from 'firebase/firestore';
import {auth,db} from './client';
import {decodeCoachConversation,encodeCoachConversation,type CoachConversation} from '../../lib/coachConversation';
const PAGE_SIZE=8;
function databaseFor(uid:string){if(!db||auth?.currentUser?.uid!==uid)throw new Error('Sign in to view your AI Coach history.');return db;}
export async function listCoachConversations(uid:string,cursor?:QueryDocumentSnapshot<DocumentData>|null){
 const database=databaseFor(uid);const base=collection(database,'users',uid,'coachConversations');
 const snapshot=await getDocsFromServer(query(base,orderBy('updatedAt','desc'),...(cursor?[startAfter(cursor)]:[]),limit(PAGE_SIZE)));
 return {items:snapshot.docs.flatMap(document=>{const value=decodeCoachConversation(document.id,document.data());return value?[value]:[];}),cursor:snapshot.docs.at(-1)||null,hasMore:snapshot.size===PAGE_SIZE};
}
export async function saveCoachConversation(uid:string,conversation:CoachConversation):Promise<CoachConversation>{
 const database=databaseFor(uid),reference=doc(database,'users',uid,'coachConversations',conversation.id);
 return runTransaction(database,async transaction=>{
  const snapshot=await transaction.get(reference);
  const revision=snapshot.exists()?snapshot.data().revision:0;
  if(revision!==conversation.revision)throw new Error('This conversation changed on another device. Your reply is kept on this device; reopen History before continuing.');
  const saved={...conversation,revision:revision+1,updatedAt:Date.now()};
  const encoded=encodeCoachConversation(saved);if(!decodeCoachConversation(saved.id,encoded))throw new Error('This conversation is too large to save. Start a new chat.');
  transaction.set(reference,encoded);return saved;
 });
}
