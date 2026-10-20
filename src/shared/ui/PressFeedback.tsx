import {useEffect} from 'react';

// Visual feedback only: never cancel touch events, move focus or trigger actions.
export const PressFeedback=()=>{
  useEffect(()=>{
    let pressed:HTMLElement|null=null;
    let timer:ReturnType<typeof setTimeout>|undefined;
    const clear=()=>{clearTimeout(timer);pressed?.removeAttribute('data-pressed');pressed=null;};
    const down=(event:PointerEvent)=>{
      document.documentElement.dataset.inputMode="pointer";
      clear();
      if(!event.isPrimary||event.button!==0)return;
      const target=event.target instanceof Element?event.target.closest<HTMLElement>('button,a[href],[role="button"],summary'):null;
      if(!target||target.matches(':disabled,[aria-disabled="true"]'))return;
      pressed=target;target.setAttribute('data-pressed','true');
    };
    const up=()=>{timer=setTimeout(clear,140);};
    const keyboard=()=>{clear();document.documentElement.dataset.inputMode='keyboard';};
    document.addEventListener('keydown',keyboard,true);
    document.addEventListener('pointerdown',down,true);
    document.addEventListener('pointerup',up,true);
    document.addEventListener('pointercancel',clear,true);
    document.addEventListener('scroll',clear,true);
    window.addEventListener('blur',clear);
    return()=>{clear();delete document.documentElement.dataset.inputMode;document.removeEventListener('keydown',keyboard,true);document.removeEventListener('pointerdown',down,true);document.removeEventListener('pointerup',up,true);document.removeEventListener('pointercancel',clear,true);document.removeEventListener('scroll',clear,true);window.removeEventListener('blur',clear);};
  },[]);
  return null;
};
