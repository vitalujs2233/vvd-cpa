import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Send, ShieldAlert, Users, Pin, Search, Smile, 
  Check, CheckCircle2, AlertTriangle, Sparkles 
} from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';
import { getTelegramUser, triggerHaptic } from '@/shared/lib/telegram';

// Исправлено: Полная правильная структура сообщения комьюнити "Движ"
interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  avatarText: string;
  avatarUrl?: string;
  text: string;
  time: string;
  reactions: Record<string, number>; // Эмодзи -> Количество реакций
  isStaff?: boolean;
}
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

const API = 'https://vvd-cpa-v2.onrender.com';
export const Dvizh: React.FC = () => {
  const currentUser = getTelegramUser();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [activeReactionMenu, setActiveReactionMenu] = useState<string | null>(null);
  const [moderationMenu, setModerationMenu] = useState<string | null>(null);

const ADMIN_ID = '232682307';
const isAdmin = currentUser.id.toString() === ADMIN_ID;
  const [isTyping, setIsTyping] = useState(false);
  const [showWarning, setShowWarning] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const initialScrollDone = useRef(false);
  const [viewportHeight, setViewportHeight] = useState(window.innerHeight);
const [banner, setBanner] = useState<ChatBanner | null>(null);
const [onlineCount, setOnlineCount] = useState(0);
useEffect(() => {
  const loadBanner = async () => {
    try {
      const response = await fetch(`${API}/chat/banner`, {
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
  const heartbeat = async () => {
    try {
      await fetch(`${API}/chat/online`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          telegram_id: currentUser.id,
        }),
      });

      const response = await fetch(
        `${API}/chat/online-count`,
        {
          cache: 'no-store',
        }
      );

      const data = await response.json();

      if (data.success) {
        setOnlineCount(data.online);
      }
    } catch (error) {
      console.error('Ошибка online:', error);
    }
  };

  void heartbeat();

  const heartbeatInterval = setInterval(
    heartbeat,
    30000
  );

  const counterInterval = setInterval(async () => {
    try {
      const response = await fetch(
        `${API}/chat/online-count`,
        {
          cache: 'no-store',
        }
      );

      const data = await response.json();

      if (data.success) {
        setOnlineCount(data.online);
      }
    } catch {}
  }, 5000);

  return () => {
    clearInterval(heartbeatInterval);
    clearInterval(counterInterval);
  };
}, []);
  useEffect(() => {
  const loadMessages = async () => {
    try {
      const response = await fetch(`${API}/chat/messages`, {
        cache: 'no-store',
      });

      const data = await response.json();

      if (!data.success) return;

      const loadedMessages: ChatMessage[] = (data.messages || []).map((msg: any) => ({
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
      }));

      setMessages(loadedMessages);
    } catch (error) {
      console.error('Ошибка загрузки сообщений:', error);
    }
  };

  void loadMessages();

  const interval = setInterval(() => {
    void loadMessages();
  }, 1000);

  return () => clearInterval(interval);
}, []);

  const firstLoad = useRef(true);

useEffect(() => {
  if (!initialScrollDone.current && messages.length > 0) {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({
        behavior: "auto",
      });

      initialScrollDone.current = true;
    }, 50);
  }
}, [messages]);
  useEffect(() => {
  const updateViewport = () => {
    const tg = window.Telegram?.WebApp;

    if (tg?.viewportHeight) {
      setViewportHeight(tg.viewportHeight);
    } else if (window.visualViewport) {
      setViewportHeight(window.visualViewport.height);
    } else {
      setViewportHeight(window.innerHeight);
    }
  };

  updateViewport();

  window.visualViewport?.addEventListener("resize", updateViewport);

  if (window.Telegram?.WebApp) {
    window.Telegram.WebApp.onEvent("viewportChanged", updateViewport);
  }

  return () => {
    window.visualViewport?.removeEventListener("resize", updateViewport);

    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.offEvent("viewportChanged", updateViewport);
    }
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
    const response = await fetch(`${API}/admin/chat/delete-message`, {
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
  const response = await fetch(
    `${API}/admin/chat/bans`
  );

  const data = await response.json();

  if (!data.success) {
    throw new Error("Не удалось загрузить блокировки");
  }

  return data.bans;
};
  const unbanChatUser = async (telegramId: string) => {
  const response = await fetch(
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
    const response = await fetch(`${API}/admin/chat/ban`, {
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
  if (!inputValue.trim()) return;

  if (containsForbiddenLink(inputValue)) {
    triggerHaptic.error();
    setShowWarning(true);

    setTimeout(() => {
      setShowWarning(false);
    }, 3000);

    return;
  }

  try {
    triggerHaptic.mediumImpact();

    const response = await fetch(`${API}/chat/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender_id: currentUser.id,
        sender_name: `${currentUser.first_name} ${currentUser.last_name || ''}`.trim(),
        avatar_url: currentUser.photo_url || '',
        text: inputValue.trim(),
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
    };

    setMessages(prev => [...prev, newMessage]);
    setInputValue('');
  } catch (error) {
    console.error('Ошибка отправки сообщения:', error);
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

  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages;
    return messages.filter(msg => 
      msg.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      msg.senderName.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [messages, searchQuery]);

  return (
    <div
  className="flex flex-col bg-bgMain relative select-none"
  style={{
    height: `${viewportHeight - 80}px`,
  }}
>
      
      {/* Шапка раздела */}
      <div className="flex items-center justify-between p-4 border-b border-white/[0.04] bg-bgCard/40 backdrop-blur-md shrink-0 shadow-glass-inner z-20">
        <div className="flex flex-col text-left">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-accentGold font-bold uppercase tracking-wider">Приватная соцсеть</span>
            <div className="flex items-center gap-1 bg-success/10 border border-success/20 rounded-full px-2 py-0.5 text-success text-[8px] font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-success shadow-[0_0_6px_#22C55E] animate-pulse" />
              {onlineCount} Онлайн
            </div>
          </div>
          <h1 className="text-xl font-bold text-white mt-0.5 flex items-center gap-1.5">
            Движ партнеров
            <Sparkles size={14} className="text-accentGoldBright animate-pulse" />
          </h1>
        </div>

        <button 
          onClick={() => { triggerHaptic.lightImpact(); setShowSearch(!showSearch); setSearchQuery(''); }}
          className={`w-10 h-10 rounded-full bg-white/[0.03] border flex items-center justify-center text-textSecondary active:scale-95 transition-all ${
            showSearch ? 'border-accentGold text-accentGoldBright' : 'border-white/5'
          }`}
        >
          <Search size={16} />
        </button>
      </div>

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
{banner && banner.is_active && (
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
  className="flex-1 overflow-y-auto p-4 scrollable-container flex flex-col gap-4 z-0"
>
        {filteredMessages.map((msg) => {
          const isMe = msg.senderId === currentUser.id.toString();
          const hasReactions = Object.keys(msg.reactions).length > 0;
          
          return (
            <div 
              key={msg.id}
              className={`flex gap-3 max-w-[85%] relative ${isMe ? 'self-end flex-row-reverse' : 'self-start'}`}
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
                    {msg.text}
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
                        className="flex items-center gap-1 px-2 py-0.5 bg-white/[0.02] border border-white/5 rounded-app-xs text-[10px] font-bold text-textSecondary hover:border-accentGold/20 active:scale-95"
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
                        className="w-7 h-7 flex items-center justify-center text-sm hover:bg-white/5 rounded active:scale-90 transition-transform"
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

      {/* Панель ввода сообщения */}
      <div className="p-3 border-t border-white/[0.04] bg-bgCard/50 backdrop-blur-md flex items-center gap-3 shrink-0 pb-safe shadow-[0_-8px_32px_0_rgba(0,0,0,0.37)] z-50">
        <Input 
          placeholder="Напишите в приватный чат..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyPress}
          className="flex-1 h-11 border-white/5 bg-white/[0.01]"
        />
        <Button 
          variant="primary" 
          size="md" 
          onClick={handleSendMessage}
          className="w-11 h-11 p-0 flex items-center justify-center shrink-0 rounded-full shadow-glow-purple/40 hover:-translate-y-0.5 active:scale-95"
        >
          <Send size={16} />
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
