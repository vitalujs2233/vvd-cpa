import {apiRequest,API_BASE_URL} from '@/shared/lib/api';

export type EditorialCategory={id:string;name:string;description:string;active:boolean;sort_order:number};
export type ArticleBlock={type:'paragraph'|'heading'|'image'|'link'|'quote';text:string;url:string;alt:string};
export type Article={slug:string;category_id:string;title:string;excerpt:string;cover_url:string;seo_title:string;seo_description:string;tags:string[];blocks:ArticleBlock[];published:boolean;published_at:string;updated_at:string};
export type ArticleSummary=Omit<Article,'blocks'>;
export type EditorialData={version:number;categories:EditorialCategory[];articles:Article[]};
export type PublicArticles={categories:EditorialCategory[];articles:ArticleSummary[]};

export type PublicEditorialSnapshot=PublicArticles & {details:Record<string,Article>};
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
  list:()=>apiRequest<PublicArticles>('/articles'),
  detail:(slug:string)=>apiRequest<{article:Article}>('/articles/'+encodeURIComponent(slug)),
  admin:()=>apiRequest<EditorialData>('/articles/admin'),
  save:(value:EditorialData)=>apiRequest<{success:boolean;version:number}>('/articles/admin',{method:'PUT',body:JSON.stringify(value)}),
  upload:async(id:string,file:File):Promise<string>=>{
    const form=new FormData();form.append('image',file);
    const result=await apiRequest<{image_url:string}>('/articles/admin/images/'+encodeURIComponent(id),{method:'POST',body:form});
    return API_BASE_URL+result.image_url;
  }
};
