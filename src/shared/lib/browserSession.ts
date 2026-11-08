/** Browser-only authenticated session. No unsigned Telegram ID fallback. */
const STORAGE='vvd_cpa_browser_session_v1';

export const getWebSession = ():string => {
  try {
    const value=sessionStorage.getItem(STORAGE)||'';
    return value.startsWith('vvdweb1.')&&value.length<=3000?value:'';
  } catch {return '';}
};
export const setWebSession = (value:string):void => {
  if(!value.startsWith('vvdweb1.')||value.length>3000)throw new Error('Invalid website session');
  try {sessionStorage.setItem(STORAGE,value);}
  catch {throw new Error('Browser session storage is unavailable');}
};
export const clearWebSession = ():void => {
  try {sessionStorage.removeItem(STORAGE);} catch {/* private browser mode */}
};
export const currentSignedSession = ():string =>
  window.Telegram?.WebApp?.initData || getWebSession();
