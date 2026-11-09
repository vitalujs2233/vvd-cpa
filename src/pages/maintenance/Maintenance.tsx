import React,{useCallback,useEffect,useState} from 'react';
import {AlertTriangle,ExternalLink,RefreshCcw,ShieldCheck} from 'lucide-react';
import {API_BASE_URL,apiRequest} from '@/shared/lib/api';

export type MaintenanceSettings={
  enabled:boolean;
  title:string;
  message:string;
  support_url:string;
  support_label:string;
  version:number;
};
export const DEFAULT_MAINTENANCE:MaintenanceSettings={
  enabled:false,
  title:'Технические работы',
  message:'В VVD CPA ведутся технические работы. За подробностями обращайтесь в службу поддержки.',
  support_url:'https://t.me/vvd_cpa_bot',
  support_label:'Связаться с поддержкой',
  version:1
};
const CACHE_KEY='vvd_miniapp_maintenance_last_seen';
const readCache=():MaintenanceSettings|null=>{
  try{
    const value=JSON.parse(sessionStorage.getItem(CACHE_KEY)||'null');
    if(typeof value?.enabled==='boolean'&&typeof value?.title==='string'&&
      typeof value?.message==='string'&&typeof value?.support_url==='string'&&
      typeof value?.support_label==='string')return value;
  }catch{/* Session storage is optional. */}
  return null;
};
const cleanLink=(value:string)=>{
  try{return new URL(value).protocol==='https:'?value:'';}catch{return '';}
};

export const maintenanceApi={
  admin:()=>apiRequest<MaintenanceSettings>('/miniapp-maintenance/admin'),
  save:(value:MaintenanceSettings)=>apiRequest<{success:boolean;version:number}>('/miniapp-maintenance/admin',{
    method:'PUT',body:JSON.stringify(value)
  })
};

// Independent public read: maintenance must be visible before account sign-in is complete.
export const useMiniAppMaintenance=()=>{
  const [status,setStatus]=useState<MaintenanceSettings|null>(()=>readCache());
  const [checked,setChecked]=useState(false);
  const [attempt,setAttempt]=useState(0);
  const refresh=useCallback(()=>setAttempt(n=>n+1),[]);
  useEffect(()=>{
    let mounted=true;
    const controller=new AbortController();
    const load=async()=>{
      const timeout=window.setTimeout(()=>controller.abort(),12000);
      try{
        const response=await fetch(API_BASE_URL+'/miniapp-maintenance',{
          cache:'no-store',signal:controller.signal
        });
        if(!response.ok)throw new Error('maintenance status '+response.status);
        const value=await response.json() as MaintenanceSettings;
        if(typeof value.enabled!=='boolean'||!value.title||!value.message||
          !cleanLink(value.support_url))throw new Error('invalid maintenance response');
        if(mounted){
          setStatus(value);
          try{sessionStorage.setItem(CACHE_KEY,JSON.stringify(value));}catch{}
        }
      }catch{
        // Keep the last known state if Render is temporarily unavailable.
        // Never claim maintenance is enabled when there is no confirmed status.
        if(mounted)setStatus(current=>current||DEFAULT_MAINTENANCE);
      }finally{
        window.clearTimeout(timeout);
        if(mounted)setChecked(true);
      }
    };
    void load();
    const interval=window.setInterval(()=>{
      if(document.visibilityState==='visible'){
        // Each polling call uses a fresh controller and is independent of the initial read.
        const next=new AbortController();
        const timer=window.setTimeout(()=>next.abort(),10000);
        void fetch(API_BASE_URL+'/miniapp-maintenance',{cache:'no-store',signal:next.signal})
          .then(res=>{if(!res.ok)throw new Error('status');return res.json() as Promise<MaintenanceSettings>;})
          .then(value=>{
            if(mounted&&typeof value.enabled==='boolean'&&cleanLink(value.support_url)){
              setStatus(value);
              try{sessionStorage.setItem(CACHE_KEY,JSON.stringify(value));}catch{}
            }
          }).catch(()=>{}).finally(()=>window.clearTimeout(timer));
      }
    },20000);
    return()=>{mounted=false;controller.abort();window.clearInterval(interval);};
  },[attempt]);
  return {status,checked,refresh};
};

export const MaintenanceScreen:React.FC<{settings:MaintenanceSettings;onRefresh:()=>void}>=({settings,onRefresh})=>{
  const link=cleanLink(settings.support_url);
  return <main role="status" className="min-h-[100dvh] bg-[#090807] text-[#f5e8cc] flex items-center justify-center p-5">
    <div className="w-full max-w-md rounded-[24px] border border-[#ae8644]/45 bg-gradient-to-b from-[#20190e] to-[#11100d] p-7 text-center shadow-[0_25px_90px_rgba(0,0,0,0.5)]">
      <div className="mx-auto mb-5 flex h-[70px] w-[70px] items-center justify-center rounded-full border border-[#d3a55a]/70 bg-[#332411] text-[#f6cb7b]">
        <AlertTriangle size={34} strokeWidth={1.7}/>
      </div>
      <div className="mb-2 text-[11px] font-semibold tracking-[.26em] text-[#c6a16b]">VVD CPA · PREMIUM NETWORK</div>
      <h1 className="mb-4 text-2xl font-bold leading-tight text-[#f6cd80]">{settings.title}</h1>
      <p className="whitespace-pre-line text-sm leading-7 text-[#dacbb4]">{settings.message}</p>
      {link&&<a className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-[#ecc273] px-5 py-3.5 font-bold text-[#20170b]" href={link} target="_blank" rel="noopener noreferrer">
        {settings.support_label} <ExternalLink size={17}/>
      </a>}
      <button type="button" onClick={onRefresh} className="mx-auto mt-5 flex items-center gap-2 text-xs text-[#c8b594]">
        <RefreshCcw size={15}/> Проверить доступность
      </button>
      <div className="mt-7 flex items-center justify-center gap-2 border-t border-[#aa8749]/20 pt-5 text-[11px] text-[#967e5a]">
        <ShieldCheck size={15}/> Спасибо за понимание
      </div>
    </div>
  </main>;
};
