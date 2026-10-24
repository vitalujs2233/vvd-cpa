import { apiRequest } from '@/shared/lib/api';
import type { Character } from './marketApi';
const base = 'https://vvd-cpa-v2.onrender.com';
const auth = () => {
  const raw=window.Telegram?.WebApp?.initData;
  if (!raw) throw new Error('Для управления персонажами откройте VVD CPA через кнопку Mini App в Telegram.');
  return {'X-Telegram-Init-Data':raw};
};
export type Smartlink = {id:string;url:string;title:string;offer:string|null};
export type Photo = {id:string;url:string;preview_url?:string;title:string;description:string;auto_allowed:boolean;send_rule:string};
export type ChatEntry = {role:'user'|'assistant';content:string;photo?:{url:string;title?:string}|null;offer?:{title:string;advertising:true}|null};
export type PublicSession = {token:string;greeting:string;messages:ChatEntry[];can_chat:boolean;offer:{title:string;available:boolean}};
export type ConversationSettings = {chat_style:string;reply_length:'short'|'medium'|'detailed';photo_mode:'automatic'|'rules'|'combined';link_kind?:'smartlink'|'external';smartlink_id?:string|null;spend_limit?:string};
export type ModelStats = {visits:number;conversations:number;messages:number;clicks:number;cost_usd:string|null};
export const fileUrl = (path:string) => path.startsWith('/')?base+path:path;
async function publicRequest<T>(path:string, options:RequestInit):Promise<T> {
  const controller=new AbortController();
  const timer=window.setTimeout(()=>controller.abort(),75000);
  try{return await apiRequest<T>(path,{...options,signal:controller.signal});}
  catch(e){if(controller.signal.aborted)throw new Error('Сервер не успел ответить. Обновите чат перед повторной отправкой.');throw e;}
  finally{window.clearTimeout(timer);}
}
export const aiApi = {
  links:()=>apiRequest<{links:Smartlink[]}>('/ai-studio/my-smartlinks',{headers:auth()}),
  chooseLink:(id:string,kind:'smartlink'|'external',smartlink_id:string|null,external_url:string|null,button_label:string,spend_limit:number)=>
    apiRequest('/ai-studio/models/'+encodeURIComponent(id)+'/link',{
      method:'PUT',headers:auth(),body:JSON.stringify({kind,smartlink_id,external_url,button_label,spend_limit})}),
  settings:(id:string)=>apiRequest<ConversationSettings>('/ai-studio/models/'+id+'/settings',{headers:auth()}),
  saveSettings:(id:string,value:ConversationSettings)=>apiRequest('/ai-studio/models/'+id+'/settings',{method:'PUT',headers:auth(),body:JSON.stringify(value)}),
  photos:(id:string)=>apiRequest<{photos:Photo[]}>('/ai-studio/models/'+encodeURIComponent(id)+'/photos',{headers:auth()}),
  upload:async (id:string,file:File)=>{
    const form=new FormData();form.append('file',file);form.append('rights_confirmed','true');
    const resp=await fetch(base+'/ai-studio/models/'+encodeURIComponent(id)+'/photos',
      {method:'POST',headers:auth(),body:form});
    if(!resp.ok)throw new Error((await resp.json().catch(()=>({}))).detail||'Ошибка загрузки');
    return await resp.json() as Photo;
  },
  updatePhoto:(id:string,settings:Pick<Photo,'title'|'description'|'auto_allowed'|'send_rule'>)=>
    apiRequest('/ai-studio/photos/'+id,{method:'PUT',headers:auth(),body:JSON.stringify(settings)}),
  removePhoto:(id:string)=>apiRequest('/ai-studio/photos/'+id,{method:'DELETE',headers:auth()}),
  deleteModel:(id:string)=>apiRequest('/ai-studio/models/'+id,{method:'DELETE',headers:auth()}),
  stats:(id:string)=>apiRequest<ModelStats>('/ai-studio/models/'+id+'/stats',{headers:auth()}),
  begin:(slug:string,token:string|null)=>publicRequest<PublicSession>('/ai-studio/public/'+encodeURIComponent(slug)+'/session',
    {method:'POST',body:JSON.stringify({token})}),
  send:(slug:string,token:string,message:string)=>publicRequest<ChatEntry>('/ai-studio/public/'+encodeURIComponent(slug)+'/messages',
    {method:'POST',body:JSON.stringify({token,message})}),
  click:(slug:string,token:string|null,adult_confirmed:boolean)=>apiRequest<{url:string}>('/ai-studio/public/'+encodeURIComponent(slug)+'/click',
    {method:'POST',body:JSON.stringify({token,adult_confirmed})})
};
export const getLinkMode=(c:Character & {link_kind?:string})=>c.link_kind==='smartlink'?'smartlink':'external';
