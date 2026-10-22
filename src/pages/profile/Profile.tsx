import { useNavigate } from 'react-router-dom';
import { Button } from '@/shared/ui/Button';
import React, { useState } from 'react';
import { ArrowLeft, Settings, Bell, Globe, Info, LogOut, Lock, Shield, Trash2, User, Coins, Sparkles, Crown, MessageSquare } from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { getTelegramUser, triggerHaptic } from '@/shared/lib/telegram';

export const Profile: React.FC = () => {
  const navigate = useNavigate();
  const telegramUser = getTelegramUser();

  const [subView, setSubView] = useState<'main' | 'settings'>('main');
  const profileName = `${telegramUser.first_name || ''} ${telegramUser.last_name || ''}`.trim() || 'Пользователь Telegram';
  const profileUsername = telegramUser.username;

  // Состояния общих настроек
  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailNotificationEnabled, setEmailNotificationEnabled] = useState(false);
  const [cacheSize, setCacheSize] = useState('12.4 MB');
  const [language, setLanguage] = useState('Русский');
  const [currency, setCurrency] = useState('USD');

  const handleSubViewChange = (view: 'main' | 'settings') => {
    triggerHaptic.lightImpact();
    setSubView(view);
  };

  // Метод перехода в админку
  const handleNavigateToAdmin = () => {
    triggerHaptic.mediumImpact();
    navigate('/admin');
  };

  // Метод перехода в чат личной поддержки (тикет)
  const handleNavigateToSupport = () => {
    triggerHaptic.mediumImpact();
    navigate('/support');
  };

  // Метод очистки кэша
  const handleClearCache = () => {
    if (cacheSize === '0 MB') return;
    triggerHaptic.mediumImpact();
    setCacheSize('0 MB');
    triggerHaptic.success();
  };

  const handleLogout = () => {
    triggerHaptic.mediumImpact();
    navigate('/');
  };

  return (
    <div className="flex flex-col gap-4 p-4 select-none pb-24">
      
      {/* ================= VIEW 1: ГЛАВНЫЙ ЭКРАН ПРОФИЛЯ ================= */}
      {subView === 'main' && (
        <div className="flex flex-col gap-4 animate-fade-in">
          {/* Шапка Профиля */}
          <div className="flex flex-col text-left">
            <span className="text-[10px] text-textSecondary font-bold uppercase tracking-wider">Ваш аккаунт</span>
            <h1 className="text-2xl font-bold text-white mt-1">Кабинет</h1>
          </div>

          {/* Карточка пользователя */}
          <Card padding="md" className="flex items-center gap-12 text-left relative overflow-hidden shadow-premium">
            <div className="absolute -right-16 -top-16 w-32 h-32 bg-accent-gradient/5 rounded-full blur-2xl pointer-events-none" />
            
            {telegramUser.photo_url ? (
              <img
                src={telegramUser.photo_url}
                alt={profileName}
                className="w-12 h-12 rounded-full border border-gray-800 object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-accentDark border border-accent/20 flex items-center justify-center text-accent font-bold text-base">
                {profileName.slice(0, 2).toUpperCase()}
              </div>
            )}

            <div className="flex flex-col">
              <span className="text-base font-bold text-white flex items-center gap-1.5">
                {profileName}
                <Crown size={14} className="text-accentPink" />
              </span>
              <span className="text-xs text-textSecondary mt-0.5">{profileUsername ? `@${profileUsername}` : "Telegram username не указан"}</span>
              <span className="text-[9px] text-accentPurple font-bold mt-1">ID: {telegramUser.id} • Рег. 25.05.2024</span>
            </div>
          </Card>

          {/* Реферальная программа */}
<Card
  padding="md"
  onClick={() => navigate('/referral')}
  className="cursor-pointer transition-all duration-200 shadow-premium border border-accentGold/15"
>
  <div className="flex items-center justify-between">

    <div className="flex flex-col text-left">

      <span className="text-[10px] uppercase tracking-widest font-bold text-accentGold">
        Реферальная программа
      </span>

      <span className="text-lg font-bold text-white mt-1">
        Баланс
      </span>

      <span className="text-xl font-extrabold text-accentGoldBright mt-1">
        $0.00
      </span>

      <span className="text-[11px] text-textSecondary mt-2">
        Зарабатывайте 5% от дохода приглашённых партнёров
      </span>

    </div>

    <div className="text-3xl text-accentGoldBright">
      →
    </div>

  </div>
</Card>

          {/* Меню настроек профиля (Добавлен пункт "Связаться с поддержкой") */}
          <div className="flex flex-col gap-3">
            <Card padding="none" className="divide-y divide-white/[0.04] text-left shadow-premium">
              {/* Профиль управляется Telegram и недоступен для редактирования здесь */}
              <div className="flex items-center justify-between p-4" aria-disabled="true">
                <div className="flex items-center gap-3">
                  <User size={16} className="text-accentPurple" />
                  <span className="text-xs font-semibold text-white">Изменить профиль</span>
                </div>
                <Lock size={17} className="text-textSecondary" aria-label="Заблокировано" />
              </div>

              {/* Общие настройки */}
              <div 
                onClick={() => handleSubViewChange('settings')}
                className="flex items-center justify-between p-4 hover:bg-white/[0.01] active:bg-white/[0.02] cursor-pointer transition-colors duration-150"
              >
                <div className="flex items-center gap-3">
                  <Settings size={16} className="text-accentPurple" />
                  <span className="text-xs font-semibold text-white">Общие настройки</span>
                </div>
                <span className="text-[9px] text-textSecondary font-bold uppercase tracking-wider">Язык, Кэш</span>
              </div>

              {/* Личный чат поддержки (Новое расположение по гайдлайну v2.0) */}
              <div 
                onClick={handleNavigateToSupport}
                className="flex items-center justify-between p-4 hover:bg-white/[0.01] active:bg-white/[0.02] cursor-pointer transition-colors duration-150"
              >
                <div className="flex items-center gap-3">
                  <MessageSquare size={16} className="text-accentGold" />
                  <span className="text-xs font-semibold text-white">Связаться с поддержкой</span>
                </div>
                <span className="text-[9px] text-textSecondary font-bold uppercase tracking-wider">Написать</span>
              </div>

              {/* Админ-панель (Привязана строго к вашему Telegram ID: 232682307) */}
              {telegramUser.id === 232682307 && (
                <div 
                  onClick={handleNavigateToAdmin}
                  className="flex items-center justify-between p-4 hover:bg-white/[0.01] active:bg-white/[0.02] cursor-pointer transition-all duration-200 border-t border-white/[0.04]"
                >
                  <div className="flex items-center gap-3">
                    <Shield size={16} className="text-accentPink animate-pulse" />
                    <span className="text-xs font-bold text-accentPink">Админ панель</span>
                  </div>
                  <span className="text-[10px] text-accentPink font-semibold">Войти</span>
                </div>
              )}
            </Card>

            {/* Выйти */}
            <Card padding="none" className="text-left border-error/10 bg-error/[0.01] shadow-premium">
              <div 
                onClick={handleLogout}
                className="flex items-center gap-3 p-4 hover:bg-error/[0.03] active:bg-error/[0.05] cursor-pointer transition-colors duration-150"
              >
                <LogOut size={16} className="text-error" />
                <span className="text-xs font-bold text-error">Выйти из аккаунта</span>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ================= VIEW 4: ОБЩИЕ НАСТРОЙКИ ================= */}
      {subView === 'settings' && (
        <div className="flex flex-col gap-4 animate-fade-in text-left">
          {/* Шапка */}
          <div className="flex items-center gap-3 text-left">
            <button 
              onClick={() => handleSubViewChange('main')}
              className="w-11 h-11 rounded-full bg-bgCard/40 border border-white/10 flex items-center justify-center text-textSecondary hover:text-textPrimary transition-transform shadow-glass-inner"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="flex flex-col">
              <span className="text-[10px] text-accentPurple font-bold uppercase tracking-wider">Кабинет</span>
              <h1 className="text-xl font-bold text-white leading-none mt-0.5">Общие настройки</h1>
            </div>
          </div>

          {/* Тумблеры уведомлений */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold text-white px-2">Уведомления</span>
            <Card padding="none" className="divide-y divide-white/[0.04] shadow-premium">
              {/* Push */}
              <div className="flex items-center justify-between p-4">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white">Push уведомления</span>
                  <span className="text-[9px] text-textSecondary font-semibold mt-0.5">Мгновенный отчет о конверсиях</span>
                </div>
                <button 
                  onClick={() => { triggerHaptic.lightImpact(); setPushEnabled(!pushEnabled); }}
                  className={`w-11 h-6 rounded-full p-2 transition-colors duration-200 outline-none ${
                    pushEnabled ? 'bg-accent-gradient' : 'bg-gray-800'
                  }`}
                >
                  <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                    pushEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* Email */}
              <div className="flex items-center justify-between p-4">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white">Email отчеты</span>
                  <span className="text-[9px] text-textSecondary font-semibold mt-0.5">Еженедельный аудит баланса</span>
                </div>
                <button 
                  onClick={() => { triggerHaptic.lightImpact(); setEmailNotificationEnabled(!emailNotificationEnabled); }}
                  className={`w-11 h-6 rounded-full p-2 transition-colors duration-200 outline-none ${
                    emailNotificationEnabled ? 'bg-accent-gradient' : 'bg-gray-800'
                  }`}
                >
                  <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                    emailNotificationEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </button>
              </div>
            </Card>
          </div>

          {/* Системные */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold text-white px-2">Системные параметры</span>
            <Card padding="none" className="divide-y divide-white/[0.04] shadow-premium">
              <div className="flex items-center justify-between p-4">
                <span className="text-xs font-bold text-white">Язык</span>
                <span className="text-xs font-bold text-accentPurple">{language}</span>
              </div>

              <div className="flex items-center justify-between p-4">
                <span className="text-xs font-bold text-white">Валюта</span>
                <span className="text-xs font-bold text-accentPurple">{currency}</span>
              </div>

              {/* Кэш */}
              <div 
                onClick={handleClearCache}
                className="flex items-center justify-between p-4 hover:bg-white/[0.01] active:bg-white/[0.02] cursor-pointer transition-colors"
              >
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white">Очистить кэш</span>
                  <span className="text-[9px] text-textSecondary font-semibold mt-0.5">Освободить память Webview</span>
                </div>
                <span className={`text-xs font-bold ${cacheSize === '0 MB' ? 'text-textSecondary/40' : 'text-accentPurple'}`}>
                  {cacheSize}
                </span>
              </div>
            </Card>
          </div>

          {/* Удаление */}
          <div className="flex flex-col gap-2 mt-4">
            <Card padding="none" className="border-error/15 bg-error/[0.01] shadow-premium">
              <div className="flex items-center justify-between p-4">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-error">Удалить аккаунт</span>
                  <span className="text-[9px] text-error/60 mt-0.5">Удаление аккаунта пока недоступно</span>
                </div>
                <Button 
                  variant="danger" 
                  size="sm" 
                  disabled
                  className="bg-error/10 border border-error/20 text-error hover:bg-error/20"
                >
                  <Trash2 size={12} className="mr-1.5" />
                  Удалить
                </Button>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
};
