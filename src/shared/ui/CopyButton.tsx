import React, {useEffect, useRef, useState} from 'react';
import {Check, Loader2} from 'lucide-react';

type Props = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & {text:string; children:React.ReactNode};
export const CopyButton:React.FC<Props> = ({text,children,disabled,className='',...props}) => {
  const [state,setState]=useState<'idle'|'busy'|'copied'|'error'>('idle');
  const pending=useRef(false), mounted=useRef(true), timer=useRef<ReturnType<typeof setTimeout>>();
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;clearTimeout(timer.current);};},[]);
  useEffect(()=>{setState('idle');clearTimeout(timer.current);},[text]);
  const copy=async()=>{
    if(pending.current||disabled||!text)return;
    pending.current=true;clearTimeout(timer.current);setState('busy');
    try {
      await navigator.clipboard.writeText(text);
      if(mounted.current){setState('copied');timer.current=setTimeout(()=>setState('idle'),2500);}
    } catch {if(mounted.current)setState('error');}
    finally {pending.current=false;}
  };
  return <>
    <button {...props} type="button" disabled={disabled||!text||state==='busy'} aria-busy={state==='busy'}
      aria-label={state==='copied'?'Скопировано':props['aria-label']} onClick={()=>void copy()}
      className={'relative '+className}>
      <span className={state==='busy'||state==='copied'?'invisible':''}>{children}</span>
      {state==='busy'&&<span className="absolute inset-0 flex items-center justify-center"><Loader2 size={16} className="animate-spin" aria-hidden="true"/></span>}
      {state==='copied'&&<span className="absolute inset-0 flex items-center justify-center gap-1 text-green-400" aria-hidden="true">{props['aria-label']?<Check size={18}/>:<span className="text-xs">✓ Скопировано</span>}</span>}
    </button>
    <span role={state==='error'?'alert':'status'} aria-live="polite" className={state==='error'?'block text-xs text-red-300 mt-1':'sr-only'}>
      {state==='copied'?'Скопировано':state==='error'?'Не удалось скопировать. Повторите или выделите ссылку вручную.':''}
    </span>
  </>;
};
