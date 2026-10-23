import { apiRequest } from '@/shared/lib/api';

export type ServiceStatus = 'available' | 'connecting' | 'unavailable';
export type ServiceInfo = { id: string; title: string; category: string; description: string; status: ServiceStatus; price: string | null };
export type ToolWallet = { available: string; reserved: string; currency: 'USD'; payments_enabled: boolean; refund_debt?: string };
export type ToolInvoice = {id:string;amount_usd:string;stars_amount:number|null;status:string;payment_url:string|null;created_at:string;expires_at:string|null};
export type TopupConfig = {payments_enabled:boolean;stars_per_usd:string|null;min_usd:string;max_usd:string};
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
  wallet:()=>get<ToolWallet>('/wallet'),
  topupConfig:()=>get<TopupConfig>('/topup-config'),
  paymentInvoices:()=>get<{invoices:ToolInvoice[]}>('/payment-invoices'),
  topup:(amount:string,request_id:string,expected_stars:number)=>write<ToolInvoice>('/topup','POST',{amount,request_id,expected_stars,terms_version:'tools-stars-v1'}),
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
export const usd = (input:string|number|null|undefined) => '$'+Number(input ?? 0).toFixed(2);
export const modelPageUrl = (slug:string) =>
  window.location.origin + '/vvd-cpa/model/' + encodeURIComponent(slug);
