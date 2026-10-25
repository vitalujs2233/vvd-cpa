import { apiRequest } from '@/shared/lib/api';

export type ProxyIpv4Catalog = {type:string;data:{days:number[];countries:{code:string;name:string}[];tariffs?:{country:string;mobileOperator:{name:string;rotationTime:number[]}[]}[];mobile_tariff_error?:string};minimum_count:number;purchases_enabled:boolean};
export type DeliveredProxy = {id:string;host:string;endpoints:{protocol:string;port:string}[];login?:string;password?:string;expires_at?:string;mobile_operator?:string;rotation_minutes?:number};
export type ProxyDelivery = {status:string;proxies:DeliveredProxy[];delivery_pending:boolean;expected_count:number;verification_required?:boolean};
export type ProxyIpv4Quote = {customer_total_usd:string;purchases_enabled:boolean};
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
export type NoirService = {code:string;name:string;price:string|null;stock:number;available:boolean;message:string|null};
export type NoirQuote = NoirService & {country:string;currency:'USD';expires_at:number;purchases_enabled:boolean};
export type NoirOrder = {id:string;request_id:string;country:string;service:string;amount:string;created_at:string;state:string;phone:string|null;status:string|null;expires_at:string|null;sms:{code:string;text:string;received_at:string}[];message:string|null};
let noirSession = '';
const noirPending = new Map<string,Promise<unknown>>();
function noirGet<T>(path:string):Promise<T> {
  const session=window.Telegram?.WebApp?.initData||'';
  if(session!==noirSession){noirPending.clear();noirSession=session;}
  const existing=noirPending.get(path); if(existing)return existing as Promise<T>;
  const request=get<T>('/numbers'+path).then(data=>{if(session!==(window.Telegram?.WebApp?.initData||''))throw new Error('Сессия изменилась. Откройте раздел заново.');return data;}).catch((e:unknown)=>{
    if(e instanceof Error && e.message==='network_error')throw new Error('Нет соединения с каталогом. Повторите загрузку.');
    throw e;
  }).finally(()=>{if(noirPending.get(path)===request)noirPending.delete(path);});
  noirPending.set(path,request);return request;
}
const noirPurchaseRequest=async(body:{request_id:string;country:string;service:string;confirmed_price:string})=>{
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),40000);
  try{return await apiRequest<NoirOrder>('/tools-market/numbers/orders',{method:'POST',headers:authHeaders(),body:JSON.stringify(body),signal:controller.signal});}
  finally{clearTimeout(timer);}
};
// Deduplicate only in-flight reads. Connection credentials are never persisted.
const proxyReads = new Map<string, Promise<unknown>>();
let proxyReadSession = '';
function proxyRead<T>(path:string):Promise<T> {
  const session=window.Telegram?.WebApp?.initData||'';
  if(session!==proxyReadSession){proxyReads.clear();proxyReadSession=session;}
  const existing=proxyReads.get(path);if(existing)return existing as Promise<T>;
  const request=get<T>(path).then(value=>{
    if(session!==(window.Telegram?.WebApp?.initData||''))throw new Error('Сессия изменилась. Откройте раздел заново.');
    return value;
  }).finally(()=>{if(proxyReads.get(path)===request)proxyReads.delete(path);});
  proxyReads.set(path,request);return request;
}
export const marketApi = {
  noirCheckoutConfig:()=>noirGet<{purchases_enabled:boolean}>('/checkout-config'),
  noirPurchase:noirPurchaseRequest,
  noirOrders:()=>noirGet<{orders:NoirOrder[]}>('/orders'),
  noirOrder:(id:string)=>noirGet<NoirOrder>('/orders/'+encodeURIComponent(id)),
  noirCountries:()=>noirGet<{countries:{code:string}[]}>('/countries'),
  noirServices:(country:string)=>noirGet<{services:NoirService[]}>('/services?country='+encodeURIComponent(country)),
  noirPrice:(country:string,service:string)=>noirGet<NoirQuote>('/prices?country='+encodeURIComponent(country)+'&service='+encodeURIComponent(service)),
  proxyIpv4CheckoutConfig:()=>get<{purchases_enabled:boolean;supported_purchase_types:string[]}>('/proxy-ipv4/checkout-config'),
  proxyIpv4Catalog:(kind:string)=>get<ProxyIpv4Catalog>('/proxy-ipv4/catalog?proxy_type='+encodeURIComponent(kind)),
  proxyIpv4Prepare:(body:{request_id:string;proxy_type:string;country:string;days:number;count:number;mobile_operator?:string;rotation_time?:number})=>write<{id:string;status:string;customer_total_usd:string;wallet_sufficient?:boolean;purchases_enabled:boolean}>('/proxy-ipv4/orders/prepare','POST',body),
  proxyIpv4OrderProxies:(id:string)=>proxyRead<ProxyDelivery>('/proxy-ipv4/orders/'+encodeURIComponent(id)+'/proxies'),
  proxyIpv4Purchase:(id:string)=>write<{status:string;order_number:string}>('/proxy-ipv4/orders/'+encodeURIComponent(id)+'/purchase','POST',{}),
  proxyIpv4OrderStatus:(id:string)=>proxyRead<{id:string;proxy_type:string;selection:{country:string;days:number;count:number};amount_usd:string;status:string;provider_order_id:string|null;created_at:string;updated_at:string;purchases_enabled:boolean}>('/proxy-ipv4/orders/'+encodeURIComponent(id)+'/status'),
  proxyIpv4Orders:()=>proxyRead<{orders:{id:string;proxy_type:string;selection:{country:string;days:number;count:number};amount_usd:string;status:string;created_at:string}[];purchases_enabled:boolean}>('/proxy-ipv4/orders'),
  proxyIpv4Quote:(body:{proxy_type:string;country:string;days:number;count:number;mobile_operator?:string;rotation_time?:number})=>write<ProxyIpv4Quote>('/proxy-ipv4/quote','POST',body),
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
