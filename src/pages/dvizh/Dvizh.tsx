import './Dvizh.css';
import {readSnapshot,readApiSnapshot,saveSnapshot} from '@/shared/lib/viewSnapshot';
import {CHAT_SNAPSHOT_KEY,normalizeChatMessages,type ChatMessage} from '@/shared/lib/chatSnapshot';
import { authorizedFetch } from '@/shared/lib/api';
import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { 
  Loader2, Send, ShieldAlert, Users, Pin, Search, Smile, 
  Check, CheckCircle2, AlertTriangle, Sparkles, Bell, Reply, AtSign, X 
} from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';
import { getTelegramUser, triggerHaptic } from '@/shared/lib/telegram';

// Исправлено: Полная правильная структура сообщения комьюнити "Движ"
interface ChatBanner {
  id: number;
  title: string;
  text: string;
  button_text: string;
  button_url: string;
  is_active: boolean;
}
interface SupportContact {
  id: string;
  name: string;
  role: string;
  status: 'online' | 'offline';
  subtitle: string;
}

const SUPPORT_CONTACTS: SupportContact[] = [
  {
    id: 'team',
    name: 'Support Team',
    role: 'Онлайн',
    status: 'online',
    subtitle: 'Мы ответим в ближайшее время',
  },
  {
    id: 'john',
    name: 'John Support',
    role: 'Тех. поддержка',
    status: 'online',
    subtitle: 'Вопросы по офферам и выплатам',
  },
  {
    id: 'tech',
    name: 'Tech Support',
    role: 'Офлайн',
    status: 'offline',
    subtitle: 'Технические вопросы и API',
  },
];


const AVAILABLE_REACTIONS = ['👍', '❤️', '🔥', '😂', '😎', '🚀'];

interface ChatMentionNotice {
  id: string;
  message_id: string;
  kind: 'reply' | 'mention';
  is_read: boolean;
  created_at: string;
  sender_name: string;
  text: string;
}
const tagFor = (name: string) => '@' + name.replace(/[^\p{L}\p{N}\s_]/gu, ' ').trim().replace(/\s+/g, '_');
const API = 'https://vvd-cpa-v2.onrender.com';
export const Dvizh: React.FC = () => {
  const currentUser = getTelegramUser();
  const [messages, setMessages] = useState<ChatMessage[]>(()=>readSnapshot<ChatMessage[]>(CHAT_SNAPSHOT_KEY)||[]);
  useLayoutEffect(()=>{saveSnapshot(CHAT_SNAPSHOT_KEY,messages);},[messages]);
  const [inputValue, setInputValue] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [selectedMentions, setSelectedMentions] = useState<{id:string;tag:string}[]>([]);
  const [notices, setNotices] = useState<ChatMentionNotice[]>([]);
  const dismissedNoticeIds = useRef<Set<string>>(new Set());
  const noticeGesture = useRef<{id:string;x:number;y:number}|null>(null);
  const skipNoticeClick = useRef<string|null>(null);
  const [showNotices, setShowNotices] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [noticeError, setNoticeError] = useState('');
  const composerRef = useRef<HTMLInputElement>(null);
  const touchStart = useRef<{x:number;y:number;id:string}|null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const sendingRef = useRef(false);
  const sendGeneration = useRef(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [activeReactionMenu, setActiveReactionMenu] = useState<string | null>(null);
  const [moderationMenu, setModerationMenu] = useState<string | null>(null);

  const currentUid = String(currentUser.id);
  const unreadCount = notices.filter(n => !n.is_read).length;
  const mentionSearch = inputValue.match(/(?:^|\s)@([\p{L}\p{N}_]*)$/u)?.[1] ?? null;
  const participants = useMemo(() => {
    const byId = new Map<string,{id:string;name:string;avatar?:string}>();
    for (const m of [...messages].reverse()) {
      if (!byId.has(m.senderId)) byId.set(m.senderId,{id:m.senderId,name:m.senderName,avatar:m.avatarUrl});
    }
    return [...byId.values()];
  },[messages]);
  const mentionOptions = mentionSearch === null ? [] : participants
    .filter(p => p.id !== currentUid && tagFor(p.name).slice(1).toLocaleLowerCase().includes(mentionSearch.toLocaleLowerCase()))
    .slice(0,6);
  const selectAllMention = () => {
    setInputValue(prev=>prev.replace(/(^|\s)@[\p{L}\p{N}_]*$/u,(_,space:string)=>space+'@все '));
    requestAnimationFrame(()=>composerRef.current?.focus());
    triggerHaptic.lightImpact();
  };
  const selectMention = (person:{id:string;name:string}) => {
    const tag=tagFor(person.name);
    setInputValue(prev=>{
      // Replace only the active @query; preserve text that the user already typed.
      const next=prev.replace(/(^|\s)@[\p{L}\p{N}_]*$/u,(_,space:string)=>space+tag+' ');
      return next===prev ? (prev.trimEnd()+' '+tag+' ') : next;
    });
    setSelectedMentions(prev=>[...prev.filter(p=>p.id!==person.id),{id:person.id,tag}]);
    // Mobile Safari may dismiss the keyboard when a suggestion is tapped.
    // Re-focus after React has removed the suggestion picker.
    requestAnimationFrame(()=>{
      const field=composerRef.current;
      if (!field) return;
      field.focus();
      field.setSelectionRange(field.value.length,field.value.length);
    });
    triggerHaptic.lightImpact();
  };
  const navigateToMessage = (id:string) => {
    setShowSearch(false);
    setSearchQuery('');
    setShowNotices(false);
    setHighlightId(id);
    followLatest.current=false;
    requestAnimationFrame(()=>{
      const el=[...document.querySelectorAll<HTMLElement>('[data-dvizh-id]')].find(n=>n.dataset.dvizhId===id);
      if(el) el.scrollIntoView({behavior:'smooth',block:'center'});
      else setNoticeError('Сообщение не найдено среди загруженных. Возможно, оно удалено или слишком старое.');
    });
    window.setTimeout(()=>setHighlightId(v=>v===id?null:v),3300);
  };
  const loadNotices = async () => {
    try {
      const response=await authorizedFetch(`${API}/chat/mentions`,{cache:'no-store'});
      if(!response.ok)return;
      const data=await response.json();
      if(data.success)setNotices((data.notifications||[]).filter((n:ChatMentionNotice)=>!dismissedNoticeIds.current.has(n.id)));
    } catch { /* Network can be temporarily unavailable. */ }
  };
  useEffect(()=>{
    void loadNotices();
    const timer=window.setInterval(()=>{if(!document.hidden)void loadNotices()},8000);
    return()=>window.clearInterval(timer);
  },[]);
  const dismissNotice = async (notice:ChatMentionNotice) => {
    if (dismissedNoticeIds.current.has(notice.id)) return;
    dismissedNoticeIds.current.add(notice.id);
    setNotices(prev=>prev.filter(n=>n.id!==notice.id));
    setNoticeError('');
    triggerHaptic.lightImpact();
    try {
      const response=await authorizedFetch(`${API}/chat/mentions/${notice.id}/dismiss`,{method:'POST'});
      if (!response.ok) throw new Error('Dismiss failed');
    } catch {
      dismissedNoticeIds.current.delete(notice.id);
      setNoticeError('Не удалось убрать обращение. Попробуй ещё раз.');
      void loadNotices();
    }
  };
  const openNotice = async (notice:ChatMentionNotice) => {
    setNoticeError('');
    navigateToMessage(notice.message_id);
    if(!notice.is_read){
      setNotices(prev=>prev.map(n=>n.id===notice.id?{...n,is_read:true}:n));
      try {
        const res=await authorizedFetch(`${API}/chat/mentions/${notice.id}/read`,{method:'POST'});
        if(!res.ok)void loadNotices();
      } catch { void loadNotices(); }
    }
  };
const ADMIN_ID = '232682307';
const isAdmin = currentUser.id.toString() === ADMIN_ID;
  const [isTyping, setIsTyping] = useState(false);
  const [showWarning, setShowWarning] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const initialScrollDone = useRef(false);
  const followLatest = useRef(true);
  const scrollAfterSend = useRef(false);
  const [viewport, setViewport] = useState({height: window.innerHeight, fullHeight: window.innerHeight, top: 0, keyboard: false});
  const [onlineBase] = useState(() => {
    // Decorative audience offset, separate from actual server presence.
    const key='vvd_dvizh_audience';
    try {
      const saved=Number(sessionStorage.getItem(key));
      if(saved>=5 && saved<=100) return saved;
      const value=5+Math.floor(Math.random()*96);
      sessionStorage.setItem(key,String(value));
      return value;
    } catch { return 5+Math.floor(Math.random()*96); }
  });
const [banner, setBanner] = useState<ChatBanner | null>(()=>readApiSnapshot('/chat/banner')?.banner||null);
const [onlineCount, setOnlineCount] = useState(0);
useEffect(() => {
  const loadBanner = async () => {
    try {
      const response = await authorizedFetch(`${API}/chat/banner`, {
        cache: 'no-store',
      });

      const data = await response.json();

      if (data.success) {
        setBanner(data.banner || null);
      }
    } catch (error) {
      console.error('Ошибка загрузки баннера:', error);
    }
  };

  void loadBanner();
}, []);
  useEffect(() => {
    let active=true;
    let busy=false;
    const heartbeat=async()=>{
      if(document.hidden || busy) return;
      busy=true;
      try {
        const sent=await authorizedFetch(`${API}/chat/online`,{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({telegram_id:currentUser.id}),
        });
        if(!sent.ok) throw new Error('Presence unavailable');
        const response=await authorizedFetch(`${API}/chat/online-count`,{cache:'no-store'});
        const data=await response.json();
        if(active && response.ok && data.success) setOnlineCount(Number(data.online)||0);
      } catch(error) { console.error('Ошибка online:',error); }
      finally { busy=false; }
    };
    void heartbeat();
    const timer=setInterval(heartbeat,10000);
    document.addEventListener('visibilitychange',heartbeat);
    return()=>{active=false;clearInterval(timer);document.removeEventListener('visibilitychange',heartbeat);};
  },[currentUser.id]);
  useEffect(() => {
  let active=true;
  let loading=false;
  const loadMessages = async () => {
    if(loading || sendingRef.current) return;
    loading=true;
    const generation=sendGeneration.current;
    try {
      const response = await authorizedFetch(`${API}/chat/messages`, {
        cache: 'no-store',
      });

      const data = await response.json();

      if (!active || !data.success || generation!==sendGeneration.current || sendingRef.current) return;

      const loadedMessages = normalizeChatMessages(data);

      setMessages(loadedMessages);
    } catch (error) {
      console.error('Ошибка загрузки сообщений:', error);
    } finally { loading=false; }
  };

  void loadMessages();

  const interval = setInterval(() => {
    void loadMessages();
  }, 1000);

  return () => {active=false;clearInterval(interval);};
}, []);

useLayoutEffect(() => {
  const box=chatContainerRef.current;
  if(box && messages.length && (!initialScrollDone.current || scrollAfterSend.current || followLatest.current)) {
    box.scrollTop=box.scrollHeight;
    initialScrollDone.current=true;
    scrollAfterSend.current=false;
    followLatest.current=true;
  }
}, [messages, viewport.height, viewport.keyboard]);
  useLayoutEffect(() => {
    const tg=window.Telegram?.WebApp as (NonNullable<typeof window.Telegram>['WebApp'] & {
      onEvent?: (event:string,callback:()=>void)=>void;
      offEvent?: (event:string,callback:()=>void)=>void;
    }) | undefined;
    if(tg?.isExpanded===false) tg.expand();
    let fullHeight=Math.max(window.innerHeight,window.visualViewport?.height||0,tg?.viewportStableHeight||0);
    let liveHeight=window.visualViewport?.height || tg?.viewportHeight || window.innerHeight;
    document.body.classList.add('dvizh-active');
    document.body.style.setProperty('--dvizh-full-height',`${fullHeight}px`);
    let frame=0;
    let settleTimer=0;
    let keyboardOpen=false;
    let disposed=false;
    let editing=false;
    const applyViewport=()=>{
      if(disposed) return;
      // WebView's Telegram height can lag behind iOS keyboard dismissal.
      // Use one live viewport source instead of taking the smallest cached value.
      const vv=window.visualViewport;
      const height=editing ? liveHeight : fullHeight;
      fullHeight=Math.max(fullHeight,height);
      const reduced=editing && fullHeight-height>100;
      if(reduced) keyboardOpen=true;
      else if(fullHeight-height<40) keyboardOpen=false;
      // Keep compact mode until the viewport actually expands, even after blur.
      document.body.style.setProperty('--dvizh-full-height',`${fullHeight}px`);
      const box=chatContainerRef.current;
      const nearBottom=box ? box.scrollHeight-box.scrollTop-box.clientHeight<100 : false;
      setViewport({height,fullHeight,top:editing && keyboardOpen ? vv?.offsetTop||0 : 0,keyboard:keyboardOpen});
      if(nearBottom || document.activeElement?.tagName==='INPUT') {
        requestAnimationFrame(()=>{if(!disposed && box) box.scrollTop=box.scrollHeight;});
      }
    };
    const updateViewport=()=>{
      cancelAnimationFrame(frame);
      frame=requestAnimationFrame(applyViewport);
      window.clearTimeout(settleTimer);
      settleTimer=window.setTimeout(applyViewport,350);
    };
    const visualResize=()=>{
      liveHeight=window.visualViewport?.height || window.innerHeight;
      updateViewport();
    };
    const telegramResize=()=>{
      // Use the height from the source that just changed, not a stale minimum.
      if(tg?.viewportHeight) liveHeight=tg.viewportHeight;
      updateViewport();
    };
    const focusIn=(event:FocusEvent)=>{
      if(!(event.target instanceof HTMLInputElement) || !event.target.closest('.dvizh-chat')) return;
      editing=true;
      updateViewport();
    };
    const focusOut=()=>{
      editing=false;
      keyboardOpen=false;
      // The composer returns to the menu immediately. No stale viewport or timer
      // is allowed to keep the unfocused chat at the keyboard height.
      applyViewport();
    };
    const dismiss=()=>{
      const input=document.activeElement;
      if(input instanceof HTMLInputElement) input.blur();
      focusOut();
    };
    const dismissOnOutside=(event:PointerEvent)=>{
      const target=event.target;
      if(target instanceof Element && !target.closest('input,button,a')) dismiss();
    };
    document.addEventListener('pointerdown',dismissOnOutside,true);
    updateViewport();
    window.addEventListener('resize',visualResize);
    window.visualViewport?.addEventListener('resize',visualResize);
    window.visualViewport?.addEventListener('scroll',updateViewport);
    document.addEventListener('focusin',focusIn);
    document.addEventListener('focusout',focusOut);
    tg?.onEvent?.('viewportChanged',telegramResize);
    return()=>{
      disposed=true;
      document.removeEventListener('pointerdown',dismissOnOutside,true);
      cancelAnimationFrame(frame);
      window.clearTimeout(settleTimer);
      document.body.classList.remove('dvizh-active');
      document.body.style.removeProperty('--dvizh-full-height');
      window.removeEventListener('resize',visualResize);
      window.visualViewport?.removeEventListener('resize',visualResize);
      window.visualViewport?.removeEventListener('scroll',updateViewport);
      document.removeEventListener('focusin',focusIn);
      document.removeEventListener('focusout',focusOut);
      tg?.offEvent?.('viewportChanged',telegramResize);
    };
  }, []);

  const containsForbiddenLink = (text: string): boolean => {
    const linkRegex = /(https?:\/\/|t\.me|telegram\.me|bit\.ly|tinyurl|cutt\.ly|vk\.com|instagram|facebook|youtube|discord|[a-zA-Z0-9-]+\.[a-zA-Z]{2,})/gi;
    return linkRegex.test(text);
  };
const deleteChatMessage = async (messageId: string) => {
  if (!isAdmin) return;

  const confirmed = window.confirm('Удалить это сообщение?');
  if (!confirmed) return;

  try {
    const response = await authorizedFetch(`${API}/admin/chat/delete-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        admin_id: ADMIN_ID,
        message_id: messageId,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || data.detail || 'Ошибка удаления');
    }

    setMessages(prev =>
      prev.filter(msg => msg.id !== messageId)
    );

    setModerationMenu(null);
  } catch (error) {
    console.error('Ошибка удаления сообщения:', error);
    window.alert('Не удалось удалить сообщение');
  }
};
const loadChatBans = async () => {
  const response = await authorizedFetch(
    `${API}/admin/chat/bans`
  );

  const data = await response.json();

  if (!data.success) {
    throw new Error("Не удалось загрузить блокировки");
  }

  return data.bans;
};
  const unbanChatUser = async (telegramId: string) => {
  const response = await authorizedFetch(
    `${API}/admin/chat/unban`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        admin_id: ADMIN_ID,
        telegram_id: Number(telegramId),
      }),
    }
  );

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.message || "Ошибка разблокировки");
  }

  return true;
};
const banChatUser = async (msg: ChatMessage) => {
  if (!isAdmin) return;

  const confirmed = window.confirm(
    `Заблокировать пользователя ${msg.senderName}?`
  );

  if (!confirmed) return;

  try {
    const response = await authorizedFetch(`${API}/admin/chat/ban`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        telegram_id: Number(msg.senderId),
        user_name: msg.senderName,
        admin_id: ADMIN_ID,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || data.detail || 'Ошибка блокировки');
    }

    setModerationMenu(null);
    window.alert(`${msg.senderName} заблокирован`);
  } catch (error) {
    console.error('Ошибка блокировки пользователя:', error);
    window.alert('Не удалось заблокировать пользователя');
  }
};
  const handleSendMessage = async () => {
  if (sendingRef.current || !inputValue.trim()) return;
  const sentText=inputValue.trim();
  if (/((?:^|\s)@все)(?![\p{L}\p{N}_])/iu.test(sentText)) {
    if (!isAdmin) {
      setSendError('Команда @все доступна только администратору.');
      return;
    }
    if (!window.confirm('Отправить это сообщение всем зарегистрированным пользователям VVD CPA? Каждому придёт уведомление в «Движ».')) return;
  }
  const sentReply=replyTo;
  const sentMentions=selectedMentions
    .filter(p=>sentText.toLocaleLowerCase().includes(p.tag.toLocaleLowerCase()))
    .map(p=>p.id);

  if (containsForbiddenLink(inputValue)) {
    triggerHaptic.error();
    setShowWarning(true);

    setTimeout(() => {
      setShowWarning(false);
    }, 3000);

    return;
  }

  sendingRef.current=true;
  sendGeneration.current+=1;
  setSending(true);
  setSendError('');
  try {
    triggerHaptic.mediumImpact();

    const response = await authorizedFetch(`${API}/chat/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender_id: currentUser.id,
        sender_name: `${currentUser.first_name} ${currentUser.last_name || ''}`.trim(),
        avatar_url: currentUser.photo_url || '',
        text: sentText,
        reply_to_id: sentReply?.id || null,
        mention_ids: sentMentions,
        reactions: {},
        is_staff: false,
      }),
    });

    const data = await response.json();

    if (data.banned) {
  triggerHaptic.error();

  window.alert(
    data.message || 'Доступ к чату ограничен модерацией'
  );

  return;
}

if (!response.ok || !data.success) {
  throw new Error(
    data.message || 'Ошибка отправки сообщения'
  );
}

    const msg = data.message;

    const newMessage: ChatMessage = {
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
    };

    scrollAfterSend.current=true;
    followLatest.current=true;
    setMessages(prev => prev.some(m=>m.id===newMessage.id) ? prev : [...prev, newMessage]);
    setInputValue(current=>current.trim()===sentText ? '' : current);
    setReplyTo(current=>current?.id===sentReply?.id ? null : current);
    setSelectedMentions(prev=>prev.filter(p=>!sentMentions.includes(p.id)));
    void loadNotices();
    requestAnimationFrame(()=>{
      const box=chatContainerRef.current;
      if(box) box.scrollTop=box.scrollHeight;
    });
  } catch (error) {
    console.error('Ошибка отправки сообщения:', error);
    setSendError('Не удалось подтвердить отправку. Проверьте чат перед повторной отправкой.');
  } finally {
    sendingRef.current=false;
    sendGeneration.current+=1;
    setSending(false);
  }
};

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };

  const handleAddReaction = (messageId: string, emoji: string) => {
    triggerHaptic.lightImpact();
    setMessages(prev => prev.map(msg => {
      if (msg.id === messageId) {
        const currentCount = msg.reactions[emoji] || 0;
        return {
          ...msg,
          reactions: {
            ...msg.reactions,
            [emoji]: currentCount + 1
          }
        };
      }
      return msg;
    }));
    setActiveReactionMenu(null);
  };

  const formatMessage = (body:string) => body.split(/(@[\p{L}\p{N}_]+)/gu).map((part,i)=>
    part.startsWith('@') ? <span key={i} className="text-accentGoldBright font-semibold">{part}</span> : <React.Fragment key={i}>{part}</React.Fragment>
  );
  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages;
    return messages.filter(msg => 
      msg.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      msg.senderName.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [messages, searchQuery]);

  return (
    <div
  className={`dvizh-chat flex flex-col bg-bgMain fixed left-0 right-0 select-none overflow-hidden ${viewport.keyboard ? "dvizh-chat-typing" : ""}`}
  style={{
    height: `${Math.max(0,Math.min(viewport.height,viewport.fullHeight - 80))}px`,
    top: viewport.top,
  }}
>
      
      {/* Шапка раздела */}
      <div className="dvizh-heading flex items-center justify-between p-4 border-b border-white/[0.04] bg-bgCard/40 backdrop-blur-md shrink-0 shadow-glass-inner z-20">
        <div className="flex flex-col text-left">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-accentGold font-bold uppercase tracking-wider">Приватная соцсеть</span>
            <div className="flex items-center gap-1 bg-success/10 border border-success/20 rounded-full px-2 py-0.5 text-success text-[8px] font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-success shadow-[0_0_6px_#22C55E] animate-pulse" />
              {onlineBase + onlineCount} Онлайн
            </div>
          </div>
          <h1 className="text-xl font-bold text-white mt-0.5 flex items-center gap-1.5">
            Движ партнеров
            <Sparkles size={14} className="text-accentGoldBright animate-pulse" />
          </h1>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button type="button" aria-label={`Обращения к тебе: ${unreadCount} непрочитанных`}
            onClick={()=>{setShowNotices(v=>!v);setNoticeError('');void loadNotices()}}
            className="relative w-10 h-10 rounded-full border border-accentGold/30 bg-accentGold/10 flex items-center justify-center text-accentGoldBright">
            <Bell size={18}/>
            {unreadCount>0 && <span className="absolute -top-1 -right-1 min-w-5 h-5 rounded-full bg-accentGold text-black text-[10px] font-bold flex items-center justify-center px-1">{unreadCount>99?'99+':unreadCount}</span>}
          </button>
        <button 
          onClick={() => { triggerHaptic.lightImpact(); setShowSearch(!showSearch); setSearchQuery(''); }}
          className={`w-10 h-10 rounded-full bg-white/[0.03] border flex items-center justify-center text-textSecondary transition-all ${
            showSearch ? 'border-accentGold text-accentGoldBright' : 'border-white/5'
          }`}
        >
          <Search size={16} />
        </button>
        </div>
      </div>

      {showNotices && (
        <div className="shrink-0 max-h-[42vh] overflow-y-auto bg-[#171512] border-b border-accentGold/30 p-3 z-30" aria-label="Обращения к тебе">
          <div className="flex items-center justify-between mb-2">
            <strong className="text-sm text-white">Обращения к тебе</strong>
            <button aria-label="Закрыть обращения" onClick={()=>setShowNotices(false)}><X size={16}/></button>
          </div>
          {notices.length===0 && <p className="text-xs text-textSecondary">Пока никто не упоминал тебя и не отвечал на твои сообщения.</p>}
          {notices.map(n=>(
            <div key={n.id} className={`relative flex items-start rounded-xl mb-2 border overflow-hidden touch-pan-y ${n.is_read?'border-white/5 bg-white/[0.02]':'border-accentGold/40 bg-accentGold/10'}`}
              onTouchStart={event=>{const t=event.touches[0];noticeGesture.current={id:n.id,x:t.clientX,y:t.clientY}}}
              onTouchEnd={event=>{
                const start=noticeGesture.current;noticeGesture.current=null;
                if(!start||start.id!==n.id)return;
                const t=event.changedTouches[0];
                if(start.x-t.clientX>65&&Math.abs(t.clientY-start.y)<55){
                  skipNoticeClick.current=n.id;
                  void dismissNotice(n);
                  window.setTimeout(()=>{if(skipNoticeClick.current===n.id)skipNoticeClick.current=null},450);
                }
              }}>
              <button type="button" onClick={()=>{if(skipNoticeClick.current!==n.id)void openNotice(n)}}
                aria-label={`Открыть обращение от ${n.sender_name}`}
                className="flex-1 min-w-0 text-left p-3 pr-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <strong className="text-accentGoldBright truncate">{n.sender_name}</strong>
                  {!n.is_read && <span className="text-accentGold shrink-0">● новое</span>}
                </div>
                <p className="text-[11px] text-textSecondary mt-1">{n.kind==='reply'?'Ответил на твоё сообщение':/(^|\s)@все(?![\p{L}\p{N}_])/iu.test(n.text)?'Администратор упомянул всех':'Упомянул тебя'}</p>
                <p className="text-xs text-white/90 truncate mt-1">{n.text}</p>
              </button>
              <button type="button" aria-label={`Удалить обращение от ${n.sender_name}`}
                title="Убрать уведомление" onClick={()=>void dismissNotice(n)}
                className="shrink-0 flex items-center justify-center w-10 h-12 mt-1 text-textSecondary hover:text-accentGoldBright active:bg-white/10">
                <X size={17}/>
              </button>
            </div>
          ))}
        </div>
      )}
      {noticeError && <p role="alert" className="text-xs text-accentGold px-4 py-2">{noticeError}</p>}

      {/* Панель поиска */}
      {showSearch && (
        <div className="px-4 py-3 bg-bgCard/50 border-b border-white/[0.04] backdrop-blur-md shrink-0 z-10 animate-fade-in flex items-center gap-3">
          <Input 
            placeholder="Поиск по сообщениям или автору..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 h-10"
            icon={<Search size={14} />}
          />
        </div>
      )}

     {/* Рекламный баннер */}
{banner && banner.is_active && !viewport.keyboard && (
  <div className="px-4 py-2 shrink-0 z-10">
    <div className="rounded-2xl border border-accentGold/30 bg-gradient-to-r from-accentGold/[0.10] to-bgCard/80 px-4 py-3 shadow-lg">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] text-accentGold font-bold uppercase tracking-widest">
            {banner.title}
          </div>

          <div className="text-[12px] text-textSecondary mt-1">
            {banner.text}
          </div>
        </div>

        {banner.button_text && banner.button_url && (
          <button
            onClick={() => window.open(banner.button_url, '_blank')}
            className="shrink-0 px-3 py-2 rounded-xl bg-accentGold text-black text-[11px] font-bold"
          >
            {banner.button_text}
          </button>
        )}
      </div>
    </div>
  </div>
)}

      {/* Контейнер сообщений */}
      <div
  ref={chatContainerRef}
  onScroll={event=>{
    const box=event.currentTarget;
    followLatest.current=box.scrollHeight-box.scrollTop-box.clientHeight<80;
  }}
  onClick={event=>{
    if(!(event.target as HTMLElement).closest('button,a,input')) {
      const focused=document.activeElement;
      if(focused instanceof HTMLInputElement) focused.blur();
    }
  }}
  className="flex-1 min-h-0 overflow-y-auto p-4 scrollable-container flex flex-col gap-4 z-0"
>
        {filteredMessages.map((msg) => {
          const isMe = msg.senderId === currentUser.id.toString();
          const hasReactions = Object.keys(msg.reactions).length > 0;
          
          return (
            <div
              key={msg.id}
              data-dvizh-id={msg.id}
              onTouchStart={e=>{const t=e.touches[0];touchStart.current={x:t.clientX,y:t.clientY,id:msg.id}}}
              onTouchEnd={e=>{const t=e.changedTouches[0];const start=touchStart.current;touchStart.current=null;if(start?.id===msg.id&&t.clientX-start.x>75&&Math.abs(t.clientY-start.y)<45){setReplyTo(msg);triggerHaptic.lightImpact()}}}
              className={`flex gap-3 max-w-[85%] relative rounded-xl transition-colors duration-700 ${highlightId===msg.id?'bg-accentGold/25 ring-2 ring-accentGold/80':''} ${isMe ? 'self-end flex-row-reverse' : 'self-start'}`}
            >
              <div className={`w-9 h-9 rounded-full overflow-hidden flex items-center justify-center font-bold text-xs shrink-0 shadow-premium border ${
  msg.isStaff
    ? 'bg-accent-gradient text-white border-accentPink/20 shadow-glow-purple/20'
    : 'bg-bgCard/60 text-textSecondary border-white/5'
}`}>
  {msg.avatarUrl ? (
    <img
      src={msg.avatarUrl}
      alt={msg.senderName}
      className="w-full h-full object-cover"
    />
  ) : (
    msg.avatarText
  )}
</div>

              <div className="flex flex-col gap-1 relative">
                <span className={`text-[10px] font-bold px-1 text-left ${
                  msg.isStaff ? 'text-accentGoldBright' : 'text-textSecondary/80'
                }`}>
                  {msg.senderName}
                </span>
                <button type="button" className="self-start text-[10px] text-accentGold/90 flex items-center gap-1 px-1"
                  onClick={()=>{setReplyTo(msg);triggerHaptic.lightImpact();composerRef.current?.focus()}}>
                  <Reply size={12}/> Ответить
                </button>
{isAdmin && !isMe && (
  <div className="relative self-start">
    <button
      onClick={() =>
        setModerationMenu(
          moderationMenu === msg.id ? null : msg.id
        )
      }
      className="w-7 h-7 flex items-center justify-center rounded-full text-textSecondary hover:text-white hover:bg-white/10"
    >
      ⋮
    </button>

    {moderationMenu === msg.id && (
      <div className="absolute left-0 top-8 z-50 min-w-[170px] rounded-xl border border-white/10 bg-[#111] p-1 shadow-2xl">
        <button
          onClick={() => deleteChatMessage(msg.id)}
          className="w-full px-3 py-2 text-left text-xs text-red-400 hover:bg-white/5 rounded-lg"
        >
          Удалить сообщение
        </button>

        <button
          onClick={() => banChatUser(msg)}
          className="w-full px-3 py-2 text-left text-xs text-yellow-400 hover:bg-white/5 rounded-lg"
        >
          Заблокировать
        </button>
      </div>
    )}
  </div>
)}
                <div className="relative group">
                  <div className={`p-3 text-sm text-left leading-relaxed shadow-premium ${
                    isMe 
                      ? 'bg-white/[0.03] text-textPrimary rounded-card rounded-tr-none border border-white/10' 
                      : 'glass-card text-textPrimary rounded-card rounded-tl-none'
                  }`}>
                    {msg.replyToId && (
                      <button type="button" onClick={()=>navigateToMessage(msg.replyToId!)}
                        className="block w-full text-left border-l-2 border-accentGold bg-accentGold/10 rounded-r-lg px-2 py-1 mb-2 max-w-[70vw]">
                        <span className="text-accentGoldBright font-semibold text-xs block truncate">{msg.replySenderName || 'Сообщение удалено'}</span>
                        <span className="text-textSecondary text-xs block truncate">{msg.replyText || 'Исходное сообщение недоступно'}</span>
                      </button>
                    )}
                    <span className="whitespace-pre-wrap break-words">{formatMessage(msg.text)}</span>
                  </div>

                  <button
                    onClick={() => { triggerHaptic.lightImpact(); setActiveReactionMenu(activeReactionMenu === msg.id ? null : msg.id); }}
                    className="absolute top-1/2 -translate-y-1/2 -right-10 opacity-0 group-hover:opacity-100 transition-opacity bg-bgCard/80 border border-white/10 rounded-full w-7 h-7 flex items-center justify-center text-textSecondary hover:text-white"
                    style={isMe ? { left: '-32px', right: 'auto' } : {}}
                  >
                    <Smile size={14} />
                  </button>
                </div>

                {/* Сетка реакций */}
                {hasReactions && (
                  <div className={`flex flex-wrap gap-1.5 mt-1.5 ${isMe ? 'justify-end' : 'justify-start'}`}>
                    {Object.entries(msg.reactions).map(([emoji, count]) => (
                      <button
                        key={emoji}
                        onClick={() => handleAddReaction(msg.id, emoji)}
                        className="flex items-center gap-1 px-2 py-0.5 bg-white/[0.02] border border-white/5 rounded-app-xs text-[10px] font-bold text-textSecondary hover:border-accentGold/20"
                      >
                        <span>{emoji}</span>
                        <span>{count}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Меню реакций */}
                {activeReactionMenu === msg.id && (
                  <div className={`absolute top-full z-30 flex gap-1 p-1 bg-bgCard/90 border border-white/10 rounded-app-xs shadow-glow-purple/20 animate-fade-in ${
                    isMe ? 'right-0' : 'left-0'
                  }`}>
                    {AVAILABLE_REACTIONS.map(emoji => (
                      <button
                        key={emoji}
                        onClick={() => handleAddReaction(msg.id, emoji)}
                        className="w-7 h-7 flex items-center justify-center text-sm hover:bg-white/5 rounded transition-transform"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Лоадер набора текста */}
        {isTyping && (
          <div className="self-start flex items-center gap-2 bg-bgCard/30 backdrop-blur-sm border border-white/[0.04] p-3 rounded-card rounded-bl-none text-[10px] text-textSecondary font-semibold animate-pulse">
            <Sparkles size={10} className="text-accentGoldBright animate-spin" style={{ animationDuration: '4s' }} />
            <span>Оператор поддержки готовит ответ...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {sendError && <p role="alert" className="shrink-0 px-3 py-1 text-xs text-error">{sendError}</p>}
      {replyTo && (
        <div className="shrink-0 flex items-center gap-2 bg-accentGold/10 border-t border-accentGold/30 px-4 py-2">
          <Reply size={16} className="text-accentGoldBright shrink-0"/>
          <div className="flex-1 min-w-0 text-left">
            <div className="text-xs font-semibold text-accentGoldBright">Ответ: {replyTo.senderName}</div>
            <div className="text-xs text-textSecondary truncate">{replyTo.text}</div>
          </div>
          <button aria-label="Отменить ответ" onClick={()=>setReplyTo(null)}><X size={17}/></button>
        </div>
      )}
      {(mentionOptions.length>0 || (isAdmin && mentionSearch!==null && 'все'.includes(mentionSearch.toLocaleLowerCase()))) && (
        <div className="shrink-0 max-h-44 overflow-y-auto bg-[#171512] border-t border-accentGold/30 px-3 py-2 z-40" role="listbox" aria-label="Кого упомянуть">
          <div className="text-[11px] text-textSecondary px-3 pb-1">Выбери человека, затем допиши сообщение</div>
          {isAdmin && mentionSearch!==null && 'все'.includes(mentionSearch.toLocaleLowerCase()) && (
            <button type="button" role="option" aria-selected={false}
              className="block w-full text-left px-3 py-3 text-sm text-accentGoldBright font-semibold rounded-md active:bg-accentGold/20"
              onTouchEnd={e=>{e.preventDefault();selectAllMention()}}
              onClick={selectAllMention}>
              <AtSign size={13} className="inline mr-2"/>все — уведомить всех участников VVD
            </button>
          )}
          {mentionOptions.map(p=>(
            <button key={p.id} type="button" role="option" aria-selected={false}
              className="block w-full text-left px-3 py-3 text-sm text-white active:bg-accentGold/20 hover:bg-accentGold/10 rounded-md"
              onTouchEnd={e=>{e.preventDefault();selectMention(p)}}
              onClick={()=>selectMention(p)}>
              <AtSign size={13} className="inline text-accentGoldBright mr-2"/>{p.name}
            </button>
          ))}
        </div>
      )}
      {selectedMentions.some(p=>inputValue.toLocaleLowerCase().includes(p.tag.toLocaleLowerCase())) && mentionSearch===null && (
        <div className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-2 border-t border-accentGold/20 bg-[#171512]">
          <span className="text-xs text-textSecondary">Упоминаешь:</span>
          {selectedMentions.filter(p=>inputValue.toLocaleLowerCase().includes(p.tag.toLocaleLowerCase())).map(p=>(
            <span key={p.id} className="rounded-full border border-accentGold/30 bg-accentGold/10 px-2 py-1 text-xs text-accentGoldBright">{p.tag}</span>
          ))}
          <span className="text-[11px] text-textSecondary">Теперь напиши текст и отправь</span>
        </div>
      )}
      {/* Панель ввода сообщения */}
      <div
  className="shrink-0 p-3 border-t border-white/[0.08] bg-bgCard/70 backdrop-blur-xl flex items-center gap-3 pb-safe shadow-[0_-8px_32px_0_rgba(0,0,0,0.37)] z-50"
>
        <Input
          ref={composerRef}
          placeholder="Сообщение или @упоминание..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyPress}
          className="flex-1 h-11 border-white/5 bg-white/[0.01]"
        />
        <Button 
          variant="primary" 
          size="md" 
          aria-label="Отправить сообщение"
          aria-busy={sending}
          disabled={sending || !inputValue.trim()}
          onPointerDown={event=>event.preventDefault()}
          onMouseDown={event=>event.preventDefault()}
          onClick={handleSendMessage}
          className="!w-11 !h-11 !p-0 overflow-hidden flex items-center justify-center shrink-0 rounded-full shadow-glow-purple/40"
        >
          {sending ? <Loader2 size={18} className="animate-spin shrink-0" aria-hidden="true" /> : <Send size={16} />}
        </Button>
      </div>

      {/* Всплывающее стеклянное уведомление при нарушении правил ввода */}
     {showWarning && (
  <div className="absolute top-20 left-4 right-4 z-[10000] glass-card p-4 border-error/20 flex items-center justify-center gap-3 text-xs text-error font-semibold rounded-app-xs animate-fade-in shadow-premium">
    <ShieldAlert size={16} className="drop-shadow-[0_0_4px_#FF4444]" />
    <span>Отправка ссылок запрещена правилами VVD CPA.</span>
  </div>
)}

    </div>
  );
};
