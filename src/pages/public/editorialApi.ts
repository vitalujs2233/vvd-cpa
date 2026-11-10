import {apiRequest,API_BASE_URL} from '@/shared/lib/api';

export type EditorialCategory={id:string;name:string;description:string;image_url?:string;active:boolean;show_on_web?:boolean;show_in_mini_app?:boolean;sort_order:number};
export type ArticleBlock={type:'paragraph'|'heading'|'image'|'link'|'quote';text:string;url:string;alt:string};
export type Article={slug:string;category_id:string;title:string;excerpt:string;cover_url:string;seo_title:string;seo_description:string;tags:string[];blocks:ArticleBlock[];published:boolean;show_on_web?:boolean;show_in_mini_app?:boolean;published_at:string;updated_at:string;view_count?:number};
export type ArticleSummary=Omit<Article,'blocks'>;
export type EditorialData={version:number;categories:EditorialCategory[];articles:Article[]};
export type PublicArticles={categories:EditorialCategory[];articles:ArticleSummary[]};

export type PublicEditorialSnapshot=PublicArticles & {details:Record<string,Article>};
// Generated at deployment from the public API and embedded in index.html before React runs.
// Never includes admin endpoints, drafts or private data.
export const bootstrappedEditorial=():PublicEditorialSnapshot|null=>{
  const value=(window as Window & {__VVD_EDITORIAL_BOOTSTRAP__?:PublicEditorialSnapshot}).__VVD_EDITORIAL_BOOTSTRAP__;
  if(!value||!Array.isArray(value.categories)||!Array.isArray(value.articles)||!value.details)return null;
  return value;
};
let snapshotPromise:Promise<PublicEditorialSnapshot>|null=null;
const snapshot=():Promise<PublicEditorialSnapshot>=>{
  if(!snapshotPromise){
    snapshotPromise=fetch('/vvd-cpa/editorial-snapshot.json')
      .then(response=>{if(!response.ok)throw new Error('Snapshot unavailable');return response.json();})
      .then((value:PublicEditorialSnapshot)=>{
        if(!Array.isArray(value.categories)||!Array.isArray(value.articles)||!value.details)
          throw new Error('Invalid snapshot');
        return value;
      }).catch(error=>{snapshotPromise=null;throw error;});
  }
  return snapshotPromise;
};

export const editorialApi={
  snapshot,
  list:(surface:'web'|'mini'='web')=>apiRequest<PublicArticles>('/articles?surface='+surface),
  detail:(slug:string,surface:'web'|'mini'='web')=>apiRequest<{article:Article}>('/articles/'+encodeURIComponent(slug)+'?surface='+surface),
  recordView:(slug:string,surface:'web'|'mini',sessionId:string)=>apiRequest<{views:number}>('/articles/'+encodeURIComponent(slug)+'/view?surface='+surface,{method:'POST',body:JSON.stringify({session_id:sessionId})}),
  admin:()=>apiRequest<EditorialData>('/articles/admin'),
  save:(value:EditorialData)=>apiRequest<{success:boolean;version:number}>('/articles/admin',{method:'PUT',body:JSON.stringify(value)}),
  upload:async(id:string,file:File):Promise<string>=>{
    const form=new FormData();form.append('image',file);
    const result=await apiRequest<{image_url:string}>('/articles/admin/images/'+encodeURIComponent(id),{method:'POST',body:form});
    return API_BASE_URL+result.image_url;
  }
};
