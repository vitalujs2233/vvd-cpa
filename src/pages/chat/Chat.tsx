import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, PlusCircle, MessageSquare, ChevronRight, 
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
  // Переключение представлений: 'contacts' (список саппортов), 'dialogue' (открытый чат)
  const [view, setView] = useState<'contacts' | 'dialogue'>('contacts');
  
  // Состояния чата
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

  // Скролл вниз к последнему сообщению при обновлении чата
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
    // По умолчанию открываем чат с Support Team при создании нового тикета
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

    // Имитация ответа оператора поддержки
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
        <div className="flex flex-col gap-16 p-16 pb-24 text-left">
          <div>
            <h1 className="text-2xl font-bold text-white">Тех. Поддержка</h1>
            <p className="text-xs text-textMuted mt-1">Создайте тикет или обратитесь напрямую к менеджеру</p>
          </div>

          {/* Вкладки Мои тикеты / Поддержка как в макете */}
          <div className="flex bg-bgCard border border-gray-800/40 rounded-app-xs p-4 gap-4">
            <button className="flex-1 py-1.5 text-xs font-semibold rounded-app-xs bg-accent text-white shadow">
              Поддержка
            </button>
            <button 
              onClick={handleCreateNewTicket}
              className="flex-1 py-1.5 text-xs font-semibold rounded-app-xs text-textMuted hover:text-white transition-colors"
            >
              Мои тикеты
            </button>
          </div>

          {/* Карточки контактов */}
          <div className="flex flex-col gap-12">
            {SUPPORT_CONTACTS.map((agent) => (
              <Card 
                key={agent.id} 
                clickable 
                padding="sm"
                onClick={() => handleOpenChat(agent)}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-12">
                  {/* Иконка-заглушка аватара */}
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-accentDark/40 border border-accent/20 flex items-center justify-center text-accent">
                      <User size={18} />
                    </div>
                    {/* Точка статуса (онлайн/офлайн) */}
                    <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-bgCard ${
                      agent.status === 'online' ? 'bg-success' : 'bg-gray-500'
                    }`} />
                  </div>

                  <div className="flex flex-col">
                    <div className="flex items-center gap-6">
                      <span className="text-xs font-bold text-white">{agent.name}</span>
                      <span className={`text-[8px] px-1.5 py-0.5 rounded-app-xs font-semibold border uppercase tracking-wider ${
                        agent.status === 'online' 
                          ? 'text-success border-success/20 bg-success/10' 
                          : 'text-textMuted border-gray-800 bg-gray-900/10'
                      }`}>
                        {agent.role}
                      </span>
                    </div>
                    <span className="text-[10px] text-textMuted mt-1">{agent.subtitle}</span>
                  </div>
                </div>

                <ChevronRight size={16} className="text-gray-600 mr-2" />
              </Card>
            ))}
          </div>

          {/* Кнопка "Создать тикет" внизу списка по макету */}
          <Button 
            variant="primary" 
            size="lg" 
            onClick={handleCreateNewTicket}
            className="h-12 mt-8"
          >
            <PlusCircle size={16} className="mr-2" />
            Создать тикет
          </Button>
        </div>
      )}

      {/* ================= VIEW 2: ОКНО ДИАЛОГА (ЧАТ) ================= */}
      {view === 'dialogue' && selectedAgent && (
        <div className="flex flex-col h-[calc(100vh-64px)] bg-bgDark">
          
          {/* Кастомная шапка активного чата */}
          <div className="flex items-center gap-12 p-16 border-b border-gray-800/40 bg-bgCard text-left shrink-0">
            <button 
              onClick={handleBackToContacts}
              className="w-8 h-8 rounded-app-xs bg-bgDark border border-gray-800/20 flex items-center justify-center text-textSec active:scale-95 transition-transform"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="flex items-center gap-10">
              <div className="relative">
                <div className="w-9 h-9 rounded-full bg-accentDark/30 border border-accent/10 flex items-center justify-center text-accent">
                  <User size={16} />
                </div>
                <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-bgCard ${
                  selectedAgent.status === 'online' ? 'bg-success' : 'bg-gray-500'
                }`} />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-white">{selectedAgent.name}</span>
                <span className="text-[9px] text-textMuted mt-0.5">Тикет поддержки активен</span>
              </div>
            </div>
          </div>

          {/* Поле отображения сообщений (Скроллируемый контейнер) */}
          <div className="flex-1 overflow-y-auto p-16 scrollable-container flex flex-col gap-12">
            {messages.map((msg) => {
              const isUser = msg.sender === 'user';
              return (
                <div 
                  key={msg.id}
                  className={`flex flex-col max-w-[75%] ${isUser ? 'self-end items-end' : 'self-start items-start'}`}
                >
                  <div className={`p-10 rounded-app-md text-xs text-left leading-relaxed ${
                    isUser 
                      ? 'bg-accent text-white rounded-br-none' 
                      : 'bg-bgCard border border-gray-800/40 text-textSec rounded-bl-none'
                  }`}>
                    {msg.text}
                  </div>
                  
                  {/* Время отправки и иконка статуса прочтения */}
                  <div className="flex items-center gap-4 mt-1 px-1">
                    <span className="text-[8px] text-textMuted font-medium">{msg.time}</span>
                    {isUser && <CheckCheck size={10} className="text-accent" />}
                  </div>
                </div>
              );
            })}

            {/* Имитация набора текста оператором */}
            {isTyping && (
              <div className="self-start flex items-center gap-6 bg-bgCard/30 border border-gray-800/20 p-10 rounded-app-md text-[10px] text-textMuted animate-pulse">
                <Sparkles size={10} className="text-accent animate-spin" />
                <span>Оператор печатает ответ...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Нижняя панель ввода сообщения */}
          <div className="p-12 border-t border-gray-800/30 bg-bgCard flex items-center gap-8 shrink-0 pb-safe">
            <Input 
              placeholder="Введите ваше сообщение..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyPress}
              className="flex-1 h-10"
            />
            <Button 
              variant="primary" 
              size="md" 
              onClick={handleSendMessage}
              className="w-10 h-10 p-0 flex items-center justify-center shrink-0 rounded-app-xs"
            >
              <Send size={16} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
