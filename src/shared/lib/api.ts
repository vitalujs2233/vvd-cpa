import {saveSnapshot} from './viewSnapshot';
/** VVD CPA primary backend_v2 API. No synthetic bearer token or client-side identity. */
export const API_BASE_URL = 'https://vvd-cpa-v2.onrender.com';

export const signedHeaders = (): Record<string,string> => {
  const data = window.Telegram?.WebApp?.initData;
  if (!data) throw new Error('Откройте VVD CPA через Telegram Mini App для авторизации.');
  return {'X-Telegram-Init-Data': data};
};

// Bound read requests so a lost connection cannot leave a screen loading forever.
// No retries: mutation requests retain their existing behavior.
const fetchRead = async (input:string, init:RequestInit):Promise<Response> => {
  if ((init.method||'GET').toUpperCase()!=='GET') return fetch(input,init);
  const controller=new AbortController();
  const cancel=()=>controller.abort();
  if(init.signal?.aborted)cancel();
  init.signal?.addEventListener('abort',cancel,{once:true});
  const timer=setTimeout(cancel,30000);
  try {return await fetch(input,{...init,signal:controller.signal});}
  finally {clearTimeout(timer);init.signal?.removeEventListener('abort',cancel);}
};

export const authorizedFetch = (input: string, init: RequestInit = {}): Promise<Response> => {
  const headers = new Headers(init.headers);
  headers.set('X-Telegram-Init-Data', signedHeaders()['X-Telegram-Init-Data']);
  return fetchRead(input,{...init,headers});
};

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(code);
    this.name = 'ApiError';
  }
}

export const apiRequest = async <T>(endpoint: string, options: RequestInit = {}): Promise<T> => {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type','application/json');
  }
  // Auth request carries initData in its body. Other owner endpoints get the signed header.
  if (endpoint !== '/auth' && window.Telegram?.WebApp?.initData && !headers.has('X-Telegram-Init-Data')) {
    headers.set('X-Telegram-Init-Data',window.Telegram.WebApp.initData);
  }
  const requestSession=window.Telegram?.WebApp?.initData;
  let response: Response;
  try {
    response = await fetchRead(API_BASE_URL + endpoint,{...options,headers});
  } catch {
    throw new ApiError(0, 'network_error');
  }
  if (!response.ok) {
    const detail = await response.json().catch(()=>({}));
    const raw = detail?.detail;
    const code = typeof raw === 'object' && typeof raw?.code === 'string'
      ? raw.code
      : typeof raw === 'string' ? raw : 'http_error';
    throw new ApiError(response.status, code);
  }
  const result=await response.json() as T;
  if((options.method||'GET').toUpperCase()==='GET'&&requestSession===window.Telegram?.WebApp?.initData)saveSnapshot('api:'+endpoint,result);
  return result;
};

export interface AuthResponse {
  user: {
    telegram_id:number;
    first_name:string;
    last_name?:string|null;
    username?:string|null;
    photo_url?:string|null;
    partner_code:string;
    role:string;
    status:string;
  };
}
// Retry only the idempotent account sign-in, never payouts or other mutations.
export const isTemporarySignInError = (error:unknown):boolean =>
  error instanceof ApiError && (error.status === 0 || error.status >= 500 || error.status === 429);

async function requestSignIn(initData:string):Promise<AuthResponse> {
  for(let attempt=0;attempt<2;attempt++) {
    if(window.Telegram?.WebApp?.initData!==initData)throw new Error('Данные входа изменились. Повторите вход.');
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),45000);
    try {
      return await apiRequest<AuthResponse>('/auth',{
        method:'POST',body:JSON.stringify({init_data:initData}),signal:controller.signal
      });
    } catch(error) {
      const failure=controller.signal.aborted ? new ApiError(0,'network_error') : error;
      if(attempt===1 || !isTemporarySignInError(failure))throw failure;
    } finally {clearTimeout(timer);}
    await new Promise(resolve=>setTimeout(resolve,1500));
  }
  throw new ApiError(0,'network_error');
}
// React StrictMode may run the startup effect twice. Reuse one request for
// the same signed Telegram launch payload instead of double registration.
let pendingAuth: { data: string; promise: Promise<AuthResponse> } | null = null;
export const loginViaTelegramApi = ():Promise<AuthResponse> => {
  const initData=window.Telegram?.WebApp?.initData;
  if(!initData) return Promise.reject(new Error('Telegram initData недоступен. Откройте Mini App из бота.'));
  if (pendingAuth?.data === initData) return pendingAuth.promise;
  const promise = requestSignIn(initData).catch((error:unknown)=>{
    if (pendingAuth?.data === initData) pendingAuth=null;
    throw error;
  });
  pendingAuth={data:initData,promise};
  return promise;
};
