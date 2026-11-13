import {useSyncExternalStore} from 'react';

// One lightweight preference shared by the guest website and Telegram Mini App.
// Localization rollout is PAUSED: English is incomplete in games, banners, media,
// article bodies, admin-published content, and several app routes.
// Keep dictionaries/hooks and persisted user preference intact for future rollout.
// See docs/LOCALIZATION_ROLLOUT.md before enabling both languages again.
export const LOCALE_SWITCH_ENABLED=false;
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
  // Force Russian throughout the app while the language switch is hidden.
  // This also handles visitors whose saved preference was previously EN.
  if(!LOCALE_SWITCH_ENABLED||!canUseDOM)return 'ru';
  try{const saved=window.localStorage.getItem(KEY);if(saved==='ru'||saved==='en')return saved;}catch{/* Storage may be unavailable. */}
  return inferLocale();
};
export const setLocale=(value:Locale)=>{
  // Do not overwrite old preferences while localization is paused.
  if(!LOCALE_SWITCH_ENABLED||!canUseDOM)return;
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
