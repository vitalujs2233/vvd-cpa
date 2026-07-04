import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Settings, Shield, Bell, Globe, Info, 
  LogOut, Lock, Smartphone, Mail, Trash2, User, 
  CheckCircle2, Coins, Sparkles, Crown, Trash 
} from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';
import { getTelegramUser, triggerHaptic } from '@/shared/lib/telegram';

interface Session {
  id: string;
  device: string;
  location: string;
}

export const Profile: React.FC = () => {
  const navigate = useNavigate();
  const telegramUser = getTelegramUser();

  const [subView, setSubView] = useState<'main' | 'settings' | 'security' | 'edit'>('main');

  const [profileName, setProfileName] = useState(`${telegramUser.first_name} ${telegramUser.last_name || ''}`.trim());
  const [profileUsername, setProfileUsername] = useState(telegramUser.username || 'johndoe');
  const [profileEmail, setProfileEmail] = useState('john@example.com');
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [is2FAEnabled, setIs2FAEnabled] = useState(true);
  const [activeSessions, setActiveSessions] = useState<Session[]>([
    { id: 'sess-1', device: 'iPhone 15 Pro • Telegram App', location: 'Москва, Россия' },
    { id: 'sess-2', device: 'MacBook Pro • Chrome Browser', location: 'Рига, Латвия' },
  ]);

  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailNotificationEnabled, setEmailNotificationEnabled] = useState(false);
  const [cacheSize, setCacheSize] = useState('12.4 MB');
  const [language, setLanguage] = useState('Русский');
  const [currency, setCurrency] = useState('USD');

  const handleSubViewChange = (view: 'main' | 'settings' | 'security' | 'edit') => {
    triggerHaptic.lightImpact();
    setSubView(view);
    setSaveSuccess(false);
  };

  const handleNavigateToAdmin = () => {
    triggerHaptic.mediumImpact();
    navigate('/admin');
  };

  const handleClearCache = () => {
    if (cacheSize === '0 MB') return;
    triggerHaptic.mediumImpact();
    setCacheSize('0 MB');
    triggerHaptic.success();
  };

  const handleTerminateSessions = () => {
    if (activeSessions.length === 0) return;
    triggerHaptic.mediumImpact();
    setActiveSessions([]);
    triggerHaptic.success();
  };

  const handleToggle2FA = () => {
    triggerHaptic.lightImpact();
    setIs2FAEnabled(!is2FAEnabled);
  };

  const handleSaveProfile = () => {
    if (!profileName.trim()) return;
    triggerHaptic.mediumImpact();
    setSaveSuccess(true);
    triggerHaptic.success();
    
    setTimeout(() => {
      setSaveSuccess(false);
    }, 2500);
  };

  const handleLogout = () => {
    triggerHaptic.mediumImpact();
    navigate('/');
  };

  return (
    <div className="flex flex-col gap-20 p-16 select-none pb-32">
      
      {/* ================= VIEW 1: ГЛАВНЫЙ ЭКРАН ПРОФИЛЯ (Раздел 5) ================= */}
      {subView === 'main' && (
        <div className="flex flex-col gap-20 animate-fade-in">
          {/* Шапка Профиля */}
          <div className="flex flex-col text-left">
            <span className="text-[10px] text-textSecondary font-bold uppercase tracking-wider">Ваш аккаунт</span>
            <h1 className="text-2xl font-bold text-white mt-1">Кабинет</h1>
          </div>

          {/* Премиальная Карточка пользователя по гайдлайну (Большая фото, Badge Partner, Badge Premium) */}
          <Card padding="md" className="flex flex-col items-center justify-center gap-16 text-center relative overflow-hidden shadow-premium">
            <div className="absolute inset-0 bg-accent-gradient/5 blur-3xl rounded-full pointer-events-none" />
            
            {/* Большая круглая фотография с люксовым градиентным бордером */}
            <div className="relative p-4 rounded-full bg-accent-gradient shadow-glow-purple/35 animate-neon-pulse">
              {telegramUser.photo_url ? (
                <img
                  src={telegramUser.photo_url}
                  alt={profileName}
                  className="w-20 h-20 rounded-full border border-bgCard object-cover"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-bgCard flex items-center justify-center text-white font-bold text-xl">
                  {profileName.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>

            <div className="flex flex-col items-center justify-center">
              <span className="text-base font-bold text-white flex items-center gap-6">
                {profileName}
                <Crown size={14} className="text-accentPink" />
              </span>
              <span className="text-xs text-textSecondary mt-0.5">@{profileUsername}</span>
              <span className="text-[9px] text-accentPurple font-bold uppercase tracking-widest mt-2">ID: {telegramUser.id} • Рег. 25.05.2024</span>
            </div>

            {/* Блок Премиум-бейджей вебмастера */}
            <div className="flex items-center gap-8 mt-2 z-10">
              <div className="bg-accent-gradient/10 border border-accentPink/20 rounded-app-xs px-2.5 py-1 flex items-center gap-4">
                <Sparkles size={8} className="text-accentPink" />
                <span className="text-[8px] font-bold text-white uppercase tracking-widest">Badge Partner</span>
              </div>
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-app-xs px-2.5 py-1 flex items-center gap-4">
                <Crown size={8} className="text-yellow-500" />
                <span className="text-[8px] font-bold text-yellow-500 uppercase tracking-widest">Premium Master</span>
              </div>
            </div>
          </Card>

          {/* Финансовая сводка по макету (Glass Card) */}
          <Card padding="sm" className="grid grid-cols-3 gap-12 text-center divide-x divide-white/[0.04] shadow-premium">
            <div className="flex flex-col items-center justify-center py-2">
              <span className="text-[9px] text-textSecondary font-bold uppercase tracking-wider">Баланс</span>
              <span className="text-xs font-bold text-white mt-1">$154.50</span>
            </div>
            <div className="flex flex-col items-center justify-center py-2">
              <span className="text-[9px] text-textSecondary font-bold uppercase tracking-wider">Hold</span>
              <span className="text-xs font-bold text-warning mt-1">$32.40</span>
            </div>
            <div className="flex flex-col items-center justify-center py-2">
              <span className="text-[9px] text-textSecondary font-bold uppercase tracking-wider">Выплачено</span>
              <span className="text-xs font-bold text-success mt-1">$1,234.50</span>
            </div>
          </Card>

          {/* Меню настроек профиля по макету (Glass Menu) */}
          <div className="flex flex-col gap-12">
            <Card padding="none" className="divide-y divide-white/[0.04] text-left shadow-premium">
              {/* Изменить профиль */}
              <div 
                onClick={() => handleSubViewChange('edit')}
                className="flex items-center justify-between p-16 hover:bg-white/[0.01] active:bg-white/[0.03] cursor-pointer transition-colors duration-150"
              >
                <div className="flex items-center gap-12">
                  <User size={16} className="text-accentPurple" />
                  <span className="text-xs font-semibold text-white">Изменить профиль</span>
                </div>
                <span className="text-[9px] text-textSecondary font-bold uppercase tracking-wider">Настроить</span>
              </div>

              {/* Безопасность */}
              <div 
                onClick={() => handleSubViewChange('security')}
                className="flex items-center justify-between p-16 hover:bg-white/[0.01] active:bg-white/[0.03] cursor-pointer transition-colors duration-150"
              >
                <div className="flex items-center gap-12">
                  <Shield size={16} className="text-accentPurple" />
                  <span className="text-xs font-semibold text-white">Панель безопасности</span>
                </div>
                <span className="text-[9px] text-success font-bold uppercase tracking-widest flex items-center gap-4">
                  <span className="w-1 h-1 rounded-full bg-success shadow-[0_0_6px_#22C55E]" />
                  2FA {is2FAEnabled ? 'Активна' : 'Выкл'}
                </span>
              </div>

              {/* Общие настройки */}
              <div 
                onClick={() => handleSubViewChange('settings')}
                className="flex items-center justify-between p-16 hover:bg-white/[0.01] active:bg-white/[0.03] cursor-pointer transition-colors duration-150"
              >
                <div className="flex items-center gap-12">
                  <Settings size={16} className="text-accentPurple" />
                  <span className="text-xs font-semibold text-white">Общие настройки</span>
                </div>
                <span className="text-[9px] text-textSecondary font-bold uppercase tracking-wider">Язык, Кэш</span>
              </div>

              {/* Админ-панель (Видна только админу 123456 по макету) */}
              {telegramUser.id === 123456 && (
                <div 
                  onClick={handleNavigateToAdmin}
                  className="flex items-center justify-between p-16 hover:bg-white/[0.01] active:bg-white/[0.03] cursor-pointer transition-all duration-200 border-t border-white/[0.04]"
                >
                  <div className="flex items-center gap-12">
                    <Shield size={16} className="text-accentPink animate-pulse" />
                    <span className="text-xs font-bold text-accentPink">Админ панель</span>
                  </div>
                  <span className="text-[9px] text-accentPink font-bold uppercase tracking-widest">Войти</span>
                </div>
              )}
            </Card>

            {/* Кнопка Выйти */}
            <Card padding="none" className="text-left border-error/10 bg-error/[0.01] shadow-premium">
              <div 
                onClick={handleLogout}
                className="flex items-center gap-12 p-16 hover:bg-error/[0.03] active:bg-error/[0.05] cursor-pointer transition-colors duration-150"
              >
                <LogOut size={16} className="text-error drop-shadow-[0_0_4px_#EF4444]" />
                <span className="text-xs font-bold text-error uppercase tracking-wider">Выйти из аккаунта</span>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ================= VIEW 2: НАСТРОЙКИ ПРОФИЛЯ (Раздел 5.2) ================= */}
      {subView === 'edit' && (
        <div className="flex flex-col gap-20 animate-fade-in">
          {/* Шапка */}
          <div className="flex items-center gap-12 text-left">
            <button 
              onClick={() => handleSubViewChange('main')}
              className="w-11 h-11 rounded-full bg-bgCard/40 border border-white/10 flex items-center justify-center text-textSecondary hover:text-textPrimary active:scale-95 transition-transform shadow-glass-inner"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="flex flex-col">
              <span className="text-[10px] text-accentPurple font-bold uppercase tracking-wider">Кабинет</span>
              <h1 className="text-xl font-bold text-white leading-none mt-0.5">Редактировать профиль</h1>
            </div>
          </div>

          {/* Форма ввода (высота 48px, скругление 12px) */}
          <div className="flex flex-col gap-12">
            <Input 
              label="Имя пользователя"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder="Введите имя"
            />
            <Input 
              label="Telegram Username"
              value={profileUsername}
              onChange={(e) => setProfileUsername(e.target.value)}
              placeholder="username"
              icon={<span className="text-xs font-bold">@</span>}
            />
            <Input 
              label="Электронная почта (Email)"
              value={profileEmail}
              onChange={(e) => setProfileEmail(e.target.value)}
              placeholder="example@mail.com"
              type="email"
              icon={<Mail size={14} />}
            />
          </div>

          {/* Статус сохранения */}
          <div className={`flex items-center gap-6 text-[10px] text-success transition-all duration-300 px-1 font-semibold justify-center ${saveSuccess ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1 h-0 pointer-events-none'}`}>
            <CheckCircle2 size={12} className="drop-shadow-[0_0_4px_#22C55E]" />
            <span>Данные профиля успешно обновлены!</span>
          </div>

          {/* Большая успешная кнопка (54px, 18px скругление) */}
          <Button 
            variant="primary" 
            size="lg" 
            onClick={handleSaveProfile}
          >
            Сохранить настройки
          </Button>
        </div>
      )}

      {/* ================= VIEW 3: НАСТРОЙКИ БЕЗОПАСНОСТИ (Раздел 5.1) ================= */}
      {subView === 'security' && (
        <div className="flex flex-col gap-20 animate-fade-in">
          {/* Шапка */}
          <div className="flex items-center gap-12 text-left">
            <button 
              onClick={() => handleSubViewChange('main')}
              className="w-11 h-11 rounded-full bg-bgCard/40 border border-white/10 flex items-center justify-center text-textSecondary hover:text-textPrimary active:scale-95 transition-transform shadow-glass-inner"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="flex flex-col">
              <span className="text-[10px] text-accentPurple font-bold uppercase tracking-wider">Кабинет</span>
              <h1 className="text-xl font-bold text-white leading-none mt-0.5">Безопасность</h1>
            </div>
          </div>

          {/* Переключатель 2FA (Glassmorphism, плавная анимация) */}
          <Card padding="md" className="flex items-center justify-between text-left border-white/5 shadow-glass-inner">
            <div className="flex items-center gap-12">
              <div className="w-9 h-9 rounded-full bg-accentPurple/10 border border-accentPurple/20 flex items-center justify-center text-accentPurple shadow-[0_0_10px_rgba(124,58,237,0.1)]">
                <Lock size={16} />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-white">Двухфакторная защита (2FA)</span>
                <span className="text-[9px] text-textSecondary font-semibold mt-0.5">Дополнительная верификация входа</span>
              </div>
            </div>

            {/* Люксовый стеклянный Switch */}
            <button 
              onClick={handleToggle2FA}
              className={`w-11 h-6 rounded-full p-2 transition-all duration-300 outline-none flex items-center ${
                is2FAEnabled ? 'bg-accent-gradient shadow-glow-purple/50' : 'bg-white/[0.04] border border-white/10'
              }`}
            >
              <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ${
                is2FAEnabled ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </Card>

          {/* Активные сессии */}
          <div className="flex flex-col gap-8 text-left">
            <div className="flex justify-between items-center px-2">
              <span className="text-xs font-bold text-white">Активные сессии</span>
              <span className="text-[10px] text-accentPurple font-bold uppercase tracking-widest">{activeSessions.length} сессии</span>
            </div>

            {activeSessions.length > 0 ? (
              <Card padding="none" className="divide-y divide-white/[0.04] shadow-premium">
                {activeSessions.map((session) => (
                  <div key={session.id} className="flex items-start gap-12 p-12 hover-lift">
                    <div className="w-8 h-8 rounded-full bg-white/[0.02] border border-white/5 flex items-center justify-center text-textSecondary shrink-0">
                      <Smartphone size={16} />
                    </div>
                    <div className="flex flex-col text-left">
                      <span className="text-xs font-bold text-white">{session.device}</span>
                      <span className="text-[9px] text-textSecondary font-semibold mt-0.5">{session.location}</span>
                    </div>
                  </div>
                ))}
              </Card>
            ) : (
              <Card padding="md" className="text-center text-xs text-textSecondary border-dashed border-white/5">
                Все сессии, кроме текущей, успешно завершены.
              </Card>
            )}
          </div>

          <Button 
            variant="secondary" 
            size="lg" 
            className="mt-4"
            onClick={handleTerminateSessions}
            disabled={activeSessions.length === 0}
          >
            Завершить все сессии
          </Button>
        </div>
      )}

      {/* ================= VIEW 4: ОБЩИЕ НАСТРОЙКИ (Раздел 8) ================= */}
      {subView === 'settings' && (
        <div className="flex flex-col gap-20 animate-fade-in text-left">
          {/* Шапка */}
          <div className="flex items-center gap-12 text-left">
            <button 
              onClick={() => handleSubViewChange('main')}
              className="w-11 h-11 rounded-full bg-bgCard/40 border border-white/10 flex items-center justify-center text-textSecondary hover:text-textPrimary active:scale-95 transition-transform shadow-glass-inner"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="flex flex-col">
              <span className="text-[10px] text-accentPurple font-bold uppercase tracking-wider">Кабинет</span>
              <h1 className="text-xl font-bold text-white leading-none mt-0.5">Общие настройки</h1>
            </div>
          </div>

          {/* Тумблеры уведомлений (Glass switches) */}
          <div className="flex flex-col gap-8">
            <span className="text-xs font-bold text-white px-2">Уведомления</span>
            <Card padding="none" className="divide-y divide-white/[0.04] shadow-premium">
              {/* Push */}
              <div className="flex items-center justify-between p-16">
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
              <div className="flex items-center justify-between p-16">
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
          <div className="flex flex-col gap-8">
            <span className="text-xs font-bold text-white px-2">Системные параметры</span>
            <Card padding="none" className="divide-y divide-white/[0.04] shadow-premium">
              <div className="flex items-center justify-between p-16">
                <span className="text-xs font-bold text-white">Язык</span>
                <span className="text-xs font-bold text-accentPurple">{language}</span>
              </div>

              <div className="flex items-center justify-between p-16">
                <span className="text-xs font-bold text-white">Валюта</span>
                <span className="text-xs font-bold text-accentPurple">{currency}</span>
              </div>

              {/* Кэш с плавной очисткой */}
              <div 
                onClick={handleClearCache}
                className="flex items-center justify-between p-16 hover:bg-white/[0.01] active:bg-white/[0.02] cursor-pointer transition-colors"
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
          <div className="flex flex-col gap-8 mt-4">
            <Card padding="none" className="border-error/15 bg-error/[0.01] shadow-premium">
              <div className="flex items-center justify-between p-16">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-error">Удалить аккаунт</span>
                  <span className="text-[9px] text-error/60 mt-0.5">Без возможности восстановления</span>
                </div>
                <Button 
                  variant="danger" 
                  size="sm" 
                  onClick={() => triggerHaptic.error()}
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
