export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  avatarText: string;
  avatarUrl?: string;
  text: string;
  time: string;
  reactions: Record<string, number>; // Эмодзи -> Количество реакций
  isStaff?: boolean;
  replyToId?: string | null;
  replySenderName?: string | null;
  replyText?: string | null;
  mentionIds?: string[];
  imageIds?: string[];
}

export const CHAT_SNAPSHOT_KEY='dvizh:messages';
export const normalizeChatMessages=(data:{messages?:any[]}):ChatMessage[]=>(data.messages || []).map((msg: any) => ({
        id: String(msg.id),
        senderId: String(msg.sender_id),
        senderName: msg.sender_name || 'Партнёр VVD',
        avatarText: (msg.sender_name || 'VV').slice(0, 2).toUpperCase(),
        avatarUrl: msg.avatar_url || '',
        text: msg.text,
        time: new Date(msg.created_at).toLocaleTimeString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        reactions: msg.reactions || {},
        isStaff: Boolean(msg.is_staff),
        replyToId: msg.reply_to_id ? String(msg.reply_to_id) : null,
        replySenderName: msg.reply_sender_name || null,
        replyText: msg.reply_text || null,
        mentionIds: Array.isArray(msg.mention_ids) ? msg.mention_ids.map(String) : [],
        imageIds: Array.isArray(msg.image_ids) ? msg.image_ids.map(String) : [],
      }));


// The community feed (not support tickets or private messages) can be shown
// from a brief, account-bound local snapshot while the signed API refreshes.
// Never store Telegram authorization, user finances or private support chats.
const DVIZH_CACHE_PREFIX='vvd_dvizh_recent_v1:';
const DVIZH_ACCOUNT_KEY='vvd_dvizh_recent_account_v1';
const DVIZH_TTL_MS=20*60*1000;
const MAX_DVIZH_MESSAGES=120;
const MAX_DVIZH_BYTES=220_000;
const safeAccount=(telegramId:number)=>Number.isSafeInteger(telegramId)&&telegramId>0?String(telegramId):'';
export function readRecentDvizhMessages(telegramId:number):ChatMessage[]|undefined{
  const account=safeAccount(telegramId);
  if(!account)return undefined;
  try{
    const previous=localStorage.getItem(DVIZH_ACCOUNT_KEY);
    if(previous&&previous!==account){
      localStorage.removeItem(DVIZH_CACHE_PREFIX+previous);
      localStorage.removeItem(DVIZH_CACHE_PREFIX+account);
      localStorage.setItem(DVIZH_ACCOUNT_KEY,account);
      return undefined;
    }
    localStorage.setItem(DVIZH_ACCOUNT_KEY,account);
    const raw=localStorage.getItem(DVIZH_CACHE_PREFIX+account);
    if(!raw)return undefined;
    const stored=JSON.parse(raw) as {at:number;messages:ChatMessage[]};
    if(!Number.isFinite(stored.at)||stored.at>Date.now()||
       Date.now()-stored.at>DVIZH_TTL_MS||!Array.isArray(stored.messages)){
      localStorage.removeItem(DVIZH_CACHE_PREFIX+account);
      return undefined;
    }
    return stored.messages;
  }catch{return undefined;}
}
export function saveRecentDvizhMessages(telegramId:number,messages:ChatMessage[]){
  const account=safeAccount(telegramId);
  if(!account||!Array.isArray(messages))return;
  try{
    const previous=localStorage.getItem(DVIZH_ACCOUNT_KEY);
    if(previous&&previous!==account)localStorage.removeItem(DVIZH_CACHE_PREFIX+previous);
    localStorage.setItem(DVIZH_ACCOUNT_KEY,account);
    const recent=messages.slice(-MAX_DVIZH_MESSAGES);
    const content=JSON.stringify({at:Date.now(),messages:recent});
    if(content.length<=MAX_DVIZH_BYTES)localStorage.setItem(DVIZH_CACHE_PREFIX+account,content);
  }catch{/* localStorage may be unavailable in Telegram WebView. */}
}
