import { apiRequest } from '@/shared/lib/api';
import type { Character } from './marketApi';
const base = 'https://vvd-cpa-v2.onrender.com';
const auth = () => {
  const raw=window.Telegram?.WebApp?.initData;
  if (!raw) throw new Error('Для управления персонажами откройте VVD CPA через кнопку Mini App в Telegram.');
  return {'X-Telegram-Init-Data':raw};
};
export type Smartlink = {id:string;url:string;title:string;offer:string|null};
export type Photo = {id:string;url:string;title:string;description:string;auto_allowed:boolean;send_rule:string};
export type ChatEntry = {role:'user'|'assistant';content:string};
export type PublicSession = {token:string;greeting:string;messages:ChatEntry[];can_chat:boolean;offer:{title:string;available:boolean}};
export type ModelStats = {visits:number;conversations:number;messages:number;clicks:number;cost_usd:string|null};
export const fileUrl = (path:string) => path.startsWith('/')?base+path:path;
export const aiApi = {
  links:()=>apiRequest<{links:Smartlink[]}>('/ai-studio/my-smartlinks',{headers:auth()}),
  chooseLink:(id:string,kind:'smartlink'|'external',smartlink_id:string|null,external_url:string|null,button_label:string,spend_limit:number)=>
    apiRequest('/ai-studio/models/'+encodeURIComponent(id)+'/link',{
      method:'PUT',headers:auth(),body:JSON.stringify({kind,smartlink_id,external_url,button_label,spend_limit})}),
  photos:(id:string)=>apiRequest<{photos:Photo[]}>('/ai-studio/models/'+encodeURIComponent(id)+'/photos',{headers:auth()}),
  upload:async (id:string,file:File)=>{
    const form=new FormData();form.append('file',file);
    const resp=await fetch(base+'/ai-studio/models/'+encodeURIComponent(id)+'/photos',
      {method:'POST',headers:auth(),body:form});
    if(!resp.ok)throw new Error((await resp.json().catch(()=>({}))).detail||'Ошибка загрузки');
    return await resp.json() as Photo;
  },
  updatePhoto:(id:string,settings:Pick<Photo,'title'|'description'|'auto_allowed'|'send_rule'>)=>
    apiRequest('/ai-studio/photos/'+id,{method:'PUT',headers:auth(),body:JSON.stringify(settings)}),
  removePhoto:(id:string)=>apiRequest('/ai-studio/photos/'+id,{method:'DELETE',headers:auth()}),
  stats:(id:string)=>apiRequest<ModelStats>('/ai-studio/models/'+id+'/stats',{headers:auth()}),
  begin:(slug:string,token:string|null)=>apiRequest<PublicSession>('/ai-studio/public/'+encodeURIComponent(slug)+'/session',
    {method:'POST',body:JSON.stringify({token})}),
  send:(slug:string,token:string,message:string)=>apiRequest<ChatEntry>('/ai-studio/public/'+encodeURIComponent(slug)+'/messages',
    {method:'POST',body:JSON.stringify({token,message})}),
  click:(slug:string,token:string|null)=>apiRequest<{url:string}>('/ai-studio/public/'+encodeURIComponent(slug)+'/click',
    {method:'POST',body:JSON.stringify({token})})
};
export const getLinkMode=(c:Character & {link_kind?:string})=>c.link_kind==='smartlink'?'smartlink':'external';
