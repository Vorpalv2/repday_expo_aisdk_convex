export async function readCoachStream(response:Response,onText:(text:string)=>void,signal?:AbortSignal):Promise<string>{
 if(!response.ok){const payload=await response.json().catch(()=>({}));throw new Error(payload.error||'AI Coach is temporarily unavailable.');}
 // Compatibility with an older deployed API during rollout.
 if(response.headers.get('content-type')?.includes('application/json')){const payload=await response.json();if(typeof payload.answer!=='string'||!payload.answer.trim())throw new Error(payload.error||'AI Coach returned an empty reply.');onText(payload.answer);return payload.answer;}
 const reader=response.body?.getReader();if(!reader)throw new Error('Streaming is unavailable on this connection. Please retry.');
 const decoder=new TextDecoder();let answer='';
 try{
  while(true){if(signal?.aborted)throw new Error('AI Coach request stopped.');const {done,value}=await reader.read();if(done)break;answer+=decoder.decode(value,{stream:true});if(answer.length>8000)throw new Error('AI Coach reply exceeded its limit. Start a new question.');onText(answer);}
  answer+=decoder.decode();if(!answer.trim())throw new Error('AI Coach could not produce a text reply. Please retry.');onText(answer);return answer;
 }catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
}
