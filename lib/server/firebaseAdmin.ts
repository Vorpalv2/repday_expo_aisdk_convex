// Server-only Firestore REST adapter. Never import this module from a component.
type Credential = { project_id: string; client_email: string; private_key: string };
type Document = { name: string; fields?: Record<string, any>; updateTime?: string };
export class ServerError extends Error {
  constructor(public status: number, message: string, public code = '') { super(message); }
}
export function adminCredential(): Credential | null {
  try {
    const value = JSON.parse(process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT || 'null');
    if (value?.project_id !== process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || typeof value?.client_email !== 'string' || typeof value?.private_key !== 'string') return null;
    return value;
  } catch { return null; }
}
function base64url(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_'); }
let access: { token: string; expires: number; email: string } | null = null;
let pending: Promise<string> | null = null;
async function accessToken() {
  const credential = adminCredential();
  if (!credential) throw new ServerError(503, 'Server billing storage is not configured yet.');
  if (access && access.email === credential.client_email && access.expires > Date.now() + 60_000) return access.token;
  if (pending) return pending;
  pending = (async () => {
    const now = Math.floor(Date.now() / 1000);
    const encode = (data: unknown) => base64url(new TextEncoder().encode(JSON.stringify(data)));
    const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: credential.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
    const pem = credential.private_key.replace(/-----[^-]+-----|\s/g, '');
    const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), char => char.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
    const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${base64url(new Uint8Array(signature))}` }), signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new ServerError(503, 'Could not authenticate billing storage.');
    const data = await response.json() as { access_token?: string; expires_in?: number };
    if (!data.access_token) throw new ServerError(503, 'Could not authenticate billing storage.');
    access = { token: data.access_token, expires: Date.now() + (data.expires_in || 3600) * 1000, email: credential.client_email };
    return data.access_token;
  })();
  try { return await pending; } finally { pending = null; }
}
const root = () => `projects/${adminCredential()?.project_id}/databases/(default)/documents`;
export const documentName = (path: string) => `${root()}/${path}`;
export function encodeFields(value: Record<string, unknown>): Record<string, any> {
  const encode = (value: any): any => {
    if (value === null || value === undefined) return { nullValue: null };
    if (typeof value === 'boolean') return { booleanValue: value };
    if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    if (typeof value === 'string') return { stringValue: value };
    if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, encode(item)])) } };
  };
  return Object.fromEntries(Object.entries(value).filter(([, value]) => value !== undefined).map(([key, value]) => [key, encode(value)]));
}
export function decodeDocument(document: Document | null): Record<string, any> | null {
  if (!document) return null;
  const decode = (value: any): any => {
    if ('nullValue' in value) return null;
    if ('stringValue' in value) return value.stringValue;
    if ('booleanValue' in value) return value.booleanValue;
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return value.doubleValue;
    if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode);
    return Object.fromEntries(Object.entries(value.mapValue?.fields || {}).map(([key, item]) => [key, decode(item)]));
  };
  return Object.fromEntries(Object.entries(document.fields || {}).map(([key, item]) => [key, decode(item)]));
}
async function request(resource: string, body?: unknown, method = 'POST', optional = false): Promise<any> {
  let token: string;
  try { token = await accessToken(); }
  catch (error) {
    if (error instanceof ServerError) throw error;
    throw new ServerError(503, 'Billing storage authentication failed. Please retry.', 'BILLING_STORAGE_AUTH_FAILED');
  }
  // Resource IDs are escaped separately; method suffixes remain outside IDs.
  let response: Response;
  try { response = await fetch(`https://firestore.googleapis.com/v1/${resource}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15_000) }); }
  catch (error) {
    const operation = resource.endsWith(':beginTransaction') ? 'begin' : resource.endsWith(':commit') ? 'commit' : resource.endsWith(':rollback') ? 'rollback' : method === 'GET' ? 'read' : 'query';
    const budgetExceeded=error instanceof Error&&error.message.includes('Too many subrequests');
    console.error('[billing-storage]',operation,budgetExceeded?'outbound-budget':error instanceof Error?error.name:'unknown');
    throw new ServerError(503,budgetExceeded?'The billing server request limit was reached. Please retry.':'Billing storage connection failed. Please retry.',budgetExceeded?'BILLING_HOST_REQUEST_LIMIT':'BILLING_STORAGE_CONNECTION_FAILED');
  }
  if (optional && response.status === 404) return null;
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { error?: { status?: string } };
    const conflict=response.status===409||response.status===412||data.error?.status==='FAILED_PRECONDITION';
    throw new ServerError(conflict?409:503,conflict?'Billing changed. Please retry your action.':'Billing storage is temporarily unavailable.',data.error?.status);
  }
  return response.json();
}
const escapedPath = (path: string) => path.split('/').map(encodeURIComponent).join('/');
export async function readDocument(path: string, transaction?: string) {
  const query = transaction ? `?transaction=${encodeURIComponent(transaction)}` : '';
  return decodeDocument(await request(`${root()}/${escapedPath(path)}${query}`, undefined, 'GET', true));
}
export async function readVersionedDocument(path:string){
  const document=await request(`${root()}/${escapedPath(path)}`,undefined,'GET',true) as Document|null;
  if(document&&!document.updateTime)throw new ServerError(503,'Billing storage returned an invalid document version.');
  return {data:decodeDocument(document),version:document?.updateTime??null};
}
export async function listDocuments(parent: string, collectionId: string, transaction?: string) {
  const data = await request(`${root()}${parent ? '/'+escapedPath(parent) : ''}:runQuery`, { structuredQuery: { from: [{ collectionId }], limit: 1000 }, ...(transaction ? { transaction } : {}) });
  return (data as { document?: Document }[]).flatMap(row => row.document ? [{ id: row.document.name.split('/').at(-1)!, data: decodeDocument(row.document)! }] : []);
}
export const documentWrite = (path: string, value: Record<string, unknown>, merge = false) => ({ update: { name: documentName(path), fields: encodeFields(value) }, ...(merge ? { updateMask: { fieldPaths: Object.keys(value) } } : {}) });
export const conditionalDocumentWrite=(path:string,value:Record<string,unknown>,version:string|null,merge=false)=>({...documentWrite(path,value,merge),currentDocument:version?{updateTime:version}:{exists:false}});
export const documentDelete = (path: string) => ({ delete: documentName(path) });
export async function commitWrites(writes: unknown[], transaction?: string) {
  return request(`${root()}:commit`, { writes, ...(transaction ? { transaction } : {}) });
}
export async function inTransaction<T>(work: (transaction: string) => Promise<{ result: T; writes: unknown[] }>): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { transaction } = await request(`${root()}:beginTransaction`, { options: { readWrite: {} } });
    try {
      const { result, writes } = await work(transaction);
      await commitWrites(writes, transaction);
      return result;
    } catch (error) {
      await request(`${root()}:rollback`, { transaction }).catch(() => {});
      if (!(error instanceof ServerError) || error.code !== 'ABORTED' || attempt === 3) throw error;
      await new Promise(resolve=>setTimeout(resolve,40*2**attempt+Math.random()*60));
    }
  }
  throw new ServerError(503, 'Please retry your change.');
}
