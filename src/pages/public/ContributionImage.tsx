import React,{useEffect,useState} from 'react';
import {API_BASE_URL,authorizedFetch} from '@/shared/lib/api';

type Props=React.ImgHTMLAttributes<HTMLImageElement> & {src:string};

/** Pending submission photos are fetched using the existing signed Telegram session. */
export const ContributionImage:React.FC<Props>=({src,alt='',...props})=>{
  const [display,setDisplay]=useState('');
  useEffect(()=>{
    if(!src){setDisplay('');return;}
    if(!src.startsWith(API_BASE_URL+'/article-contributions/images/')){
      setDisplay(src);
      return;
    }
    let active=true;
    let objectUrl='';
    setDisplay('');
    const controller=new AbortController();
    void authorizedFetch(src,{signal:controller.signal}).then(response=>{
      if(!response.ok)throw new Error('Изображение недоступно');
      return response.blob();
    }).then(blob=>{
      objectUrl=URL.createObjectURL(blob);
      if(active)setDisplay(objectUrl);
      else URL.revokeObjectURL(objectUrl);
    }).catch(()=>{if(active)setDisplay('');});
    return()=>{
      active=false;
      controller.abort();
      if(objectUrl)URL.revokeObjectURL(objectUrl);
    };
  },[src]);
  return display?<img {...props} src={display} alt={alt}/>:null;
};
