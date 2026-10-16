/** VVD CPA primary backend_v2 API. No synthetic bearer token or client-side identity. */
export const API_BASE_URL = 'https://vvd-cpa-v2.onrender.com';

export const signedHeaders = (): Record<string,string> => {
  const data = window.Telegram?.WebApp?.initData;
  if (!data) throw new Error('Откройте VVD CPA через Telegram Mini App для авторизации.');
  return {'X-Telegram-Init-Data': data};
};

export const authorizedFetch = (input: string, init: RequestInit = {}): Promise<Response> => {
  const headers = new Headers(init.headers);
  headers.set('X-Telegram-Init-Data', signedHeaders()['X-Telegram-Init-Data']);
  return fetch(input,{...init,headers});
};

export const apiRequest = async <T>(endpoint: string, options: RequestInit = {}): Promise<T> => {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type','application/json');
  }
  // Auth request carries initData in its body. Other owner endpoints get the signed header.
  if (endpoint !== '/auth' && window.Telegram?.WebApp?.initData && !headers.has('X-Telegram-Init-Data')) {
    headers.set('X-Telegram-Init-Data',window.Telegram.WebApp.initData);
  }
  const response = await fetch(API_BASE_URL + endpoint,{...options,headers});
  if (!response.ok) {
    const detail = await response.json().catch(()=>({}));
    throw new Error(String(detail.detail || 'Ошибка API: ' + response.status));
  }
  return await response.json() as T;
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
// React StrictMode may run the startup effect twice. Reuse one request for
// the same signed Telegram launch payload instead of double registration.
let pendingAuth: { data: string; promise: Promise<AuthResponse> } | null = null;
export const loginViaTelegramApi = ():Promise<AuthResponse> => {
  const initData=window.Telegram?.WebApp?.initData;
  if(!initData) return Promise.reject(new Error('Telegram initData недоступен. Откройте Mini App из бота.'));
  if (pendingAuth?.data === initData) return pendingAuth.promise;
  const promise = apiRequest<AuthResponse>('/auth',{
    method:'POST',body:JSON.stringify({init_data:initData})
  }).catch((error:unknown)=>{
    if (pendingAuth?.data === initData) pendingAuth=null;
    throw error;
  });
  pendingAuth={data:initData,promise};
  return promise;
};
