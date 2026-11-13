import {useSyncExternalStore} from 'react';

// One lightweight preference shared by the guest website and Telegram Mini App.
export type Locale='ru'|'en';
const KEY='vvd:interface-locale';
const EVENT='vvd:locale-changed';
const canUseDOM=typeof window!=='undefined';

const inferLocale=():Locale=>{
  if(!canUseDOM)return 'ru';
  const telegramCode=window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
  const code=(telegramCode||navigator.language||'ru').toLowerCase();
  return code.startsWith('ru')?'ru':'en';
};
export const getLocale=():Locale=>{
  if(!canUseDOM)return 'ru';
  try{const saved=window.localStorage.getItem(KEY);if(saved==='ru'||saved==='en')return saved;}catch{/* Storage may be unavailable. */}
  return inferLocale();
};
export const setLocale=(value:Locale)=>{
  if(!canUseDOM)return;
  try{window.localStorage.setItem(KEY,value);}catch{/* Storage may be unavailable. */}
  window.dispatchEvent(new Event(EVENT));
  document.documentElement.lang=value;
};
const subscribe=(notify:()=>void)=>{
  if(!canUseDOM)return()=>{};
  window.addEventListener(EVENT,notify);
  window.addEventListener('storage',notify);
  return()=>{window.removeEventListener(EVENT,notify);window.removeEventListener('storage',notify);};
};
export const useLocale=():Locale=>useSyncExternalStore(subscribe,getLocale,()=> 'ru');
export const localize=(locale:Locale,ru:string,en:string)=>locale==='en'?en:ru;
