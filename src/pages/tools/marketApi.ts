import { apiRequest, API_BASE_URL, authorizedFetch } from '@/shared/lib/api';

export type ServiceStatus = 'available' | 'connecting' | 'unavailable';
export type ServiceInfo = { id: string; title: string; category: string; description: string; status: ServiceStatus; price: string | null };
export type ToolWallet = { available: string; reserved: string; currency: 'USD'; payments_enabled: boolean; refund_debt?: string };
export type ToolInvoice = {id:string;amount_usd:string;stars_amount:number|null;status:string;payment_url:string|null;created_at:string;expires_at:string|null};
export type TopupConfig = {payments_enabled:boolean;stars_per_usd:string|null;usd_per_star:string;enabled:boolean;server_ready:boolean;version:number;min_usd:string;max_usd:string};
export type ToolTransaction = { id: string; kind: 'topup'|'purchase'|'refund'|'adjustment'; amount: string; status: string; created_at: string; service: string|null };
export type ToolOrder = { id: string; service_id: string; title: string; status: string; amount: string; created_at: string };
export type Character = {
  id?: string; name: string; slug: string; description: string; language: string;
  persona: string; greeting: string; offer_description: string; knowledge: string;
  goal: string; restrictions: string; photo_url: string|null;
  affiliate_url: string|null; button_label: string; extra_url: string|null;
  status: 'draft'|'published'|'disabled'; created_at?: string; updated_at?: string;
};
export type PublicCharacter = Pick<Character,'name'|'description'|'photo_url'|'greeting'|'affiliate_url'|'button_label'|'language'> & { ai_online: boolean; disclosure: string };

const authHeaders = () => {
  const initData = window.Telegram?.WebApp?.initData;
  if (!initData) throw new Error('Откройте VVD CPA внутри Telegram для доступа к своим данным.');
  return { 'X-Telegram-Init-Data': initData };
};
const get = <T>(path:string) => apiRequest<T>('/tools-market'+path, { headers: authHeaders(), cache:'no-store' });
const write = <T>(path:string, method:'POST'|'PUT', body:object) => apiRequest<T>('/tools-market'+path,{
  method, headers:authHeaders(), body:JSON.stringify(body)
});
export const marketApi = {
  adminSettings:()=>get<TopupConfig>('/admin/settings'),
  saveSettings:(body:{usd_per_star:string;enabled:boolean;version:number})=>write<TopupConfig>('/admin/settings','PUT',body),
  adminUsers:(q:string)=>get<{users:ToolAdminUser[]}>('/admin/users?q='+encodeURIComponent(q)),
  adminCredits:()=>get<{credits:ToolAdminCredit[]}>('/admin/credits'),
  manualCredit:(body:{telegram_id:string;amount:string;reason:string;request_id:string})=>write<{id:string;amount:string;replayed:boolean}>('/admin/credits','POST',body),
  wallet:()=>get<ToolWallet>('/wallet'),
  topupConfig:()=>get<TopupConfig>('/topup-config'),
  paymentInvoices:()=>get<{invoices:ToolInvoice[]}>('/payment-invoices'),
  topup:(amount:string,request_id:string,expected_stars:number,expected_usd_per_star:string)=>write<ToolInvoice>('/topup','POST',{amount,request_id,expected_stars,expected_usd_per_star,terms_version:'tools-stars-v1'}),
  catalog:()=>apiRequest<{services:ServiceInfo[];payment_provider:{status:string;assets:string[]}}>('/tools-market/catalog'),
  transactions:()=>get<{transactions:ToolTransaction[]}>('/transactions'),
  orders:()=>get<{orders:ToolOrder[]}>('/orders'),
  models:()=>get<{models:Character[]}>('/ai'),
  model:(id:string)=>get<Character>('/ai/'+encodeURIComponent(id)),
  saveModel:(value:Character)=>value.id?
    write<Character>('/ai/'+encodeURIComponent(value.id),'PUT',value):
    write<Character>('/ai','POST',value),
  publicModel:(slug:string)=>apiRequest<PublicCharacter>('/tools-market/public/ai/'+encodeURIComponent(slug))
};
export type ToolAdminUser={telegram_id:string;partner_code:string|null;first_name:string;username:string|null;available:string;refund_debt:string};
export type ToolAdminCredit={id:string;telegram_id:string;amount:string;admin_actor_id:string;reason:string;created_at:string};
export const usd = (input:string|number|null|undefined) => '$'+Number(input ?? 0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:6,useGrouping:false});
export const modelPageUrl = (slug:string) =>
  window.location.origin + '/vvd-cpa/model/' + encodeURIComponent(slug);

// SMS/proxy credentials must never enter the app's persistent API snapshot cache.
export type CyberCategory = 'numbers'|'proxy';
export type CyberOffer = {id:string;title:string;country:string;country_name?:string;service?:string;provider?:string;period?:string;category?:string;period_months?:number;days?:number|null;max_quantity?:number;available:boolean;stock?:string;price:string;protocols?:string[]};
export type CyberCatalog = {status:string;mock:boolean;purchases_enabled:boolean;message:string;countries:{code:string;name:string}[];services:{code:string;name:string;provider:string}[];periods:Record<string,string[]>;offers:CyberOffer[]};
export type CyberOrder = {id:string;amount:string;created_at:string;state:string;selection:CyberOffer&{quantity:number}};
export type CyberItem = {id:string;status?:string;phone_number?:string;expiration_time?:string|null;history_sms_code?:string[];can_cancel?:boolean;can_extend?:boolean;connection_host?:string;connection_port?:string;connection_login?:string;connection_password?:string;public_ipaddress?:string;system_status?:string;expired?:boolean;access_starts_at?:string;access_expires_at?:string;can_refresh_ip?:boolean};
const cyberRequest = async <T,>(path:string, body?:object):Promise<T> => {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),30000);
  try {
  const response=await authorizedFetch(API_BASE_URL+'/tools-market'+path,{
    method:body?'POST':'GET',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json'},
    ...(body?{body:JSON.stringify(body)}:{})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(typeof data.detail==='string'?data.detail:'Не удалось загрузить данные сервиса');
  return data as T;
  } finally {clearTimeout(timer);}
};
export const cyberApi = {
  catalog:(category:CyberCategory)=>cyberRequest<CyberCatalog>('/'+category+'/catalog'),
  search:(values:{provider:string;period:string;country:string;service:string})=>cyberRequest<{offers:CyberOffer[]}>('/numbers/search?'+new URLSearchParams(values)),
  quote:(category:CyberCategory,selection:object)=>cyberRequest<{amount:string;currency:string;mock:boolean;offer:CyberOffer}>('/'+category+'/quote',selection),
  orders:(category:CyberCategory)=>cyberRequest<{orders:CyberOrder[]}>('/'+category+'/orders'),
  detail:(category:CyberCategory,id:string)=>cyberRequest<{items:CyberItem[];state:string;actions_enabled:boolean}>('/'+category+'/orders/'+encodeURIComponent(id))
};
