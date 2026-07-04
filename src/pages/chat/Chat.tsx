import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, PlusCircle, ChevronRight, 
  ArrowLeft, CheckCheck, Sparkles, User 
} from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';
import { triggerHaptic } from '@/shared/lib/telegram';

interface SupportContact {
  id: string;
  name: string;
  role: string;
  status: 'online' | 'offline';
  subtitle: string;
}

interface Message {
  id: string;
  sender: 'user' | 'support';
  text: string;
  time: string;
  isRead: boolean;
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

export const Chat: React.FC = () => {
  const [view, setView] = useState<'contacts' | 'dialogue'>('contacts');
  
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'msg-1',
      sender: 'support',
      text: 'Здравствуйте! Кажется, у вас возник вопрос. Расскажите подробнее, и мы обязательно вам поможем!',
      time: '12:00',
      isRead: true,
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<SupportContact | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isTyping]);

  const handleOpenChat = (agent: SupportContact) => {
    triggerHaptic.mediumImpact();
    setSelectedAgent(agent);
    setView('dialogue');
  };

  const handleCreateNewTicket = () => {
    triggerHaptic.mediumImpact();
    setSelectedAgent(SUPPORT_CONTACTS[0]);
    setView('dialogue');
  };

  const handleBackToContacts = () => {
    triggerHaptic.lightImpact();
    setView('contacts');
  };

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;

    triggerHaptic.mediumImpact();

    const now = new Date();
    const timeString = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

    const userMessage: Message = {
      id: `msg-user-${Date.now()}`,
      sender: 'user',
      text: inputValue.trim(),
      time: timeString,
      isRead: true,
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    setTimeout(() => {
      setIsTyping(false);
      triggerHaptic.success();

      const supportMessage: Message = {
        id: `msg-support-${Date.now()}`,
        sender: 'support',
        text: `Приветствуем! Ваш запрос зарегистрирован. Оператор ${selectedAgent?.name || 'поддержки'} ответит вам в этом чате в течение 10 минут.`,
        time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
        isRead: false,
      };

      setMessages(prev => [...prev, supportMessage]);
    }, 2000);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full select-none">
      
      {/* ================= VIEW 1: СПИСОК КОНТАКТОВ ПОДДЕРЖКИ ================= */}
      {view === 'contacts' && (
        // Заменили внешние отступы p-16 (64px) на адаптивные p-4 (16px), а gap-20 на gap-4 (16px)
        <div className="flex flex-col gap-4 p-4 pb-24 text-left animate-fade-in">
          <div>
            <span className="text-[10px] text-textSecondary font-bold uppercase tracking-wider">Приватная поддержка</span>
            <h1 className="text-2xl font-bold text-white mt-1">Чат саппортов</h1>
          </div>

          {/* Вкладки Мои тикеты / Поддержка */}
          <div className="flex bg-bgCard/35 backdrop-blur-md border border-white/[0.04] rounded-app-xs p-2 gap-2 shadow-glass-inner">
            <button className="flex-1 py-1.5 text-xs font-semibold rounded-app-xs bg-accent-gradient text-white shadow-glow-purple">
              Поддержка
            </button>
            <button 
              onClick={handleCreateNewTicket}
              className="flex-1 py-1.5 text-xs font-semibold rounded-app-xs text-textSecondary hover:text-textPrimary transition-colors duration-200"
            >
              Мои тикеты
            </button>
          </div>

          {/* Карточки контактов (Заменили gap-12 на плотный gap-3) */}
          <div className="flex flex-col gap-3">
            {SUPPORT_CONTACTS.map((agent) => (
              <Card 
                key={agent.id} 
                clickable 
                padding="sm" // p-3 (12px)
                onClick={() => handleOpenChat(agent)}
                className="flex items-center justify-between hover-lift shadow-premium"
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-11 h-11 rounded-full bg-accentPurple/10 border border-accentPurple/20 flex items-center justify-center text-accentPurple shadow-[0_0_10px_rgba(124,58,237,0.1)]">
                      <User size={18} />
                    </div>
                    <span className={`absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full border-2 border-bgCard ${
                      agent.status === 'online' ? 'bg-success shadow-[0_0_6px_#22C55E]' : 'bg-gray-500'
                    }`} />
                  </div>

                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-white">{agent.name}</span>
                      <span className={`text-[8px] px-2 py-0.5 rounded-app-xs font-bold border uppercase tracking-wider ${
                        agent.status === 'online' 
                          ? 'text-success border-success/20 bg-success/10 shadow-[0_0_8px_rgba(34,197,94,0.15)]' 
                          : 'text-textSecondary border-gray-800 bg-gray-950'
                      }`}>
                        {agent.role}
                      </span>
                    </div>
                    <span className="text-[10px] text-textSecondary font-semibold mt-1">{agent.subtitle}</span>
                  </div>
                </div>

                <ChevronRight size={16} className="text-gray-600 mr-1" />
              </Card>
            ))}
          </div>

          {/* Кнопка "Создать тикет" */}
          <Button 
            variant="primary" 
            size="lg" 
            onClick={handleCreateNewTicket}
            className="h-12 mt-4 shadow-glow-purple"
          >
            <PlusCircle size={16} className="mr-2" />
            Создать тикет
          </Button>
        </div>
      )}

      {/* ================= VIEW 2: ОКНО ДИАЛОГА (ЧАТ) ================= */}
      {view === 'dialogue' && selectedAgent && (
        <div className="flex flex-col h-[calc(100vh-80px)] bg-bgMain animate-fade-in">
          
          {/* Стеклянный Header диалога (Заменили p-16 на p-3 (12px), а gap-12 на gap-3) */}
          <div className="flex items-center gap-3 p-3 border-b border-white/[0.04] bg-bgCard/40 backdrop-blur-md text-left shrink-0 shadow-glass-inner">
            <button 
              onClick={handleBackToContacts}
              className="w-10 h-10 rounded-full bg-bgMain border border-white/10 flex items-center justify-center text-textSecondary hover:text-textPrimary active:scale-95 transition-transform"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-accentPurple/10 border border-accentPurple/20 flex items-center justify-center text-accentPurple shadow-[0_0_10px_rgba(124,58,237,0.1)]">
                  <User size={16} />
                </div>
                <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-bgCard ${
                  selectedAgent.status === 'online' ? 'bg-success shadow-[0_0_6px_#22C55E]' : 'bg-gray-500'
                }`} />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold text-white">{selectedAgent.name}</span>
                <span className="text-[9px] text-textSecondary font-semibold mt-0.5 uppercase tracking-wider">Приватная сессия активна</span>
              </div>
            </div>
          </div>

          {/* Область сообщений (Заменили gap-16 на gap-4 (16px)) */}
          <div className="flex-1 overflow-y-auto p-4 scrollable-container flex flex-col gap-4">
            {messages.map((msg) => {
              const isUser = msg.sender === 'user';
              return (
                <div 
                  key={msg.id}
                  className={`flex flex-col max-w-[78%] ${isUser ? 'self-end items-end' : 'self-start items-start'}`}
                >
                  {/* Облака сообщений (Заменили гигантские p-12 (48px) на аккуратные p-3 (12px)) */}
                  <div className={`p-3 text-sm text-left leading-relaxed shadow-premium ${
                    isUser 
                      ? 'bg-accent-gradient text-white rounded-card rounded-br-none border border-accentPink/20 shadow-glow-purple/20' 
                      : 'glass-card text-textPrimary rounded-card rounded-bl-none'
                  }`}>
                    {msg.text}
                  </div>
                  
                  {/* Время отправки */}
                  <div className="flex items-center gap-1 mt-1.5 px-2">
                    <span className="text-[8px] text-textSecondary font-bold uppercase tracking-wider">{msg.time}</span>
                    {isUser && <CheckCheck size={10} className="text-accentPurple drop-shadow-[0_0_4px_#7C3AED]" />}
                  </div>
                </div>
              );
            })}

            {/* Статус набора текста */}
            {isTyping && (
              <div className="self-start flex items-center gap-2 bg-bgCard/30 backdrop-blur-sm border border-white/[0.04] p-3 rounded-card rounded-bl-none text-[10px] text-textSecondary font-semibold animate-pulse">
                <Sparkles size={10} className="text-accentPurple animate-spin" style={{ animationDuration: '4s' }} />
                <span>Менеджер {selectedAgent.name} печатает ответ...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Нижняя панель ввода сообщения (Заменили p-16 на p-3 (12px), а gap-12 на gap-3) */}
          <div className="p-3 border-t border-white/[0.04] bg-bgCard/50 backdrop-blur-md flex items-center gap-3 shrink-0 pb-safe shadow-[0_-8px_32px_0_rgba(0,0,0,0.37)] z-50">
            <Input 
              placeholder="Введите ваше сообщение..."
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
        </div>
      )}
    </div>
  );
};
