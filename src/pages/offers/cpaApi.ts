import {apiRequest} from '@/shared/lib/api';
export type Vertical={slug:string;title:string;description:string;icon_name:string;display_order:number;is_active:boolean;offers_count:number};
export type Network={id:number;name:string;website:string|null;description:string;is_active:boolean;connection_notes:string;click_param:string|null;offers_count:number};
export type Offer={id:string;title:string;vertical_slug:string;network_id:number|null;description:string;icon_name:string;image_url:string|null;offer_type:'offer'|'smartlink';source_url:string|null;geo:string;traffic_restrictions:string;payment_model:string;currency:string;payout_terms:string;status:'draft'|'published'|'disabled';display_order:number;commission_percent:string|number;hold_override_days:number;click_param_override:string|null};
export type PublicOffer=Pick<Offer,'id'|'title'|'description'|'icon_name'|'image_url'|'offer_type'|'geo'|'traffic_restrictions'|'payment_model'|'currency'|'payout_terms'|'status'|'hold_override_days'>;
export type PostbackConfig={postback_enabled:boolean;configured:boolean;postback_params:Record<'click'|'transaction'|'status'|'amount'|'currency',string>;postback_status_map:Record<string,'pending'|'approved'|'rejected'>;postback_last_received_at:string|null;endpoint:string};
export type PostbackUpdate=Pick<PostbackConfig,'postback_enabled'|'postback_params'|'postback_status_map'>;
export const cpaApi={
  getPostback:(id:number)=>apiRequest<PostbackConfig>('/cpa/admin/networks/'+id+'/postback'),
  savePostback:(id:number,config:PostbackUpdate)=>apiRequest<{ok:boolean}>('/cpa/admin/networks/'+id+'/postback',{method:'PUT',body:JSON.stringify(config)}),
  rotatePostback:(id:number)=>apiRequest<{secret_once:string;postback_enabled:boolean}>('/cpa/admin/networks/'+id+'/postback/rotate',{method:'POST'}),

  getLink:(id:string)=>apiRequest<{url:string|null;created:boolean}>('/cpa/links/'+encodeURIComponent(id)),
  createLink:(id:string)=>apiRequest<{url:string;created:boolean}>('/cpa/links/'+encodeURIComponent(id),{method:'POST'}),
  catalog:()=>apiRequest<{verticals:Vertical[]}>('/cpa/catalog'),
  vertical:(slug:string)=>apiRequest<{vertical:Vertical;offers:PublicOffer[]}>('/cpa/catalog/'+encodeURIComponent(slug)),
  offer:(slug:string,id:string)=>apiRequest<{vertical:Vertical;offer:PublicOffer}>('/cpa/catalog/'+encodeURIComponent(slug)+'/'+encodeURIComponent(id)),
  networks:()=>apiRequest<{items:Network[]}>('/cpa/admin/networks'),
  verticals:()=>apiRequest<{items:Vertical[]}>('/cpa/admin/verticals'),
  offers:()=>apiRequest<{items:Offer[]}>('/cpa/admin/offers'),
  saveNetwork:(value:Omit<Network,'offers_count'>)=>apiRequest(value.id?'/cpa/admin/networks/'+value.id:'/cpa/admin/networks',{method:value.id?'PUT':'POST',body:JSON.stringify(value)}),
  saveVertical:(value:Omit<Vertical,'offers_count'>,existing:boolean)=>apiRequest(existing?'/cpa/admin/verticals/'+encodeURIComponent(value.slug):'/cpa/admin/verticals',{method:existing?'PUT':'POST',body:JSON.stringify(value)}),
  saveOffer:(value:Offer,existing:boolean)=>apiRequest(existing?'/cpa/admin/offers/'+encodeURIComponent(value.id):'/cpa/admin/offers',{method:existing?'PUT':'POST',body:JSON.stringify(value)})
};
