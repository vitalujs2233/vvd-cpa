import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Settings, Shield, Bell, Globe, Info, 
  LogOut, Lock, Smartphone, Mail, Trash2, User, 
  CheckCircle2, Coins, Eye, Database 
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

  // Управление экранами профиля: 'main' (главный), 'settings' (настройки), 'security' (безопасность), 'edit' (изменение профиля)
  const [subView, setSubView] = useState<'main' | 'settings' | 'security' | 'edit'>('main');

  // Глобальные состояния пользователя (с возможностью редактирования)
  const [profileName, setProfileName] = useState(`${telegramUser.first_name} ${telegramUser.last_name || ''}`.trim());
  const [profileUsername, setProfileUsername] = useState(telegramUser.username || 'johndoe');
  const [profileEmail, setProfileEmail] = useState('john@example.com');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Состояния безопасности (2FA и активные сессии)
  const [is2FAEnabled, setIs2FAEnabled] = useState(true);
  const [activeSessions, setActiveSessions] = useState<Session[]>([
    { id: 'sess-1', device: 'iPhone 15 Pro • Telegram App', location: 'Москва, Россия' },
    { id: 'sess-2', device: 'MacBook Pro • Chrome Browser', location: 'Рига, Латвия' },
  ]);

  // Состояния общих настроек
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

  // Метод перехода в админку
  const handleNavigateToAdmin = () => {
    triggerHaptic.mediumImpact();
    navigate('/admin');
  };

  // Метод очистки кэша
  const handleClearCache = () => {
    if (cacheSize === '0 MB') return;
    triggerHaptic.mediumImpact();
    setCacheSize('0 MB');
    triggerHaptic.success();
  };

  // Метод завершения сессий
  const handleTerminateSessions = () => {
    if (activeSessions.length === 0) return;
    triggerHaptic.mediumImpact();
    setActiveSessions([]);
    triggerHaptic.success();
  };

  // Переключатель 2FA
  const handleToggle2FA = () => {
    triggerHaptic.lightImpact();
    setIs2FAEnabled(!is2FAEnabled);
  };

  // Метод сохранения формы редактирования профиля
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
              <span className="text-base font-bold text-white">{profileName}</span>
              <span className="text-xs text-textSecondary mt-0.5">@{profileUsername}</span>
              <span className="text-[9px] text-accentPurple font-bold mt-1">ID: {telegramUser.id} • Рег. 25.05.2024</span>
            </div>
          </Card>

          {/* Финансовая сводка */}
          <Card padding="sm" className="grid grid-cols-3 gap-3 text-center divide-x divide-white/[0.04] shadow-premium">
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
              <span className="text-xs font-bold text-textSec mt-1">$1,234.50</span>
            </div>
          </Card>

          {/* Меню настроек профиля */}
          <div className="flex flex-col gap-3">
            <Card padding="none" className="divide-y divide-white/[0.04] text-left shadow-premium">
              {/* Изменить профиль */}
              <div 
                onClick={() => handleSubViewChange('edit')}
                className="flex items-center justify-between p-4 hover:bg-white/[0.01] active:bg-white/[0.02] cursor-pointer transition-colors duration-150"
              >
                <div className="flex items-center gap-3">
                  <User size={16} className="text-accentPurple" />
                  <span className="text-xs font-semibold text-white">Изменить профиль</span>
                </div>
                <span className="text-[9px] text-textSecondary font-bold uppercase tracking-wider">Настроить</span>
              </div>

              {/* Безопасность */}
              <div 
                onClick={() => handleSubViewChange('security')}
                className="flex items-center justify-between p-4 hover:bg-white/[0.01] active:bg-white/[0.02] cursor-pointer transition-colors duration-150"
              >
                <div className="flex items-center gap-3">
                  <Shield size={16} className="text-accentPurple" />
                  <span className="text-xs font-semibold text-white">Панель безопасности</span>
                </div>
                <span className="text-[9px] text-success font-bold uppercase tracking-widest flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-success shadow-[0_0_6px_#22C55E]" />
                  2FA {is2FAEnabled ? 'Активна' : 'Выкл'}
                </span>
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

      {/* ================= VIEW 2: НАСТРОЙКИ ПРОФИЛЯ ================= */}
      {subView === 'edit' && (
        <div className="flex flex-col gap-4 animate-fade-in">
          {/* Шапка */}
          <div className="flex items-center gap-3 text-left">
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

          {/* Форма ввода */}
          <div className="flex flex-col gap-3">
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

          <Button 
            variant="primary" 
            size="lg" 
            onClick={handleSaveProfile}
          >
            Сохранить настройки
          </Button>
        </div>
      )}

      {/* ================= VIEW 3: НАСТРОЙКИ БЕЗОПАСНОСТИ ================= */}
      {subView === 'security' && (
        <div className="flex flex-col gap-4 animate-fade-in">
          {/* Шапка */}
          <div className="flex items-center gap-3 text-left">
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

          {/* Переключатель 2FA */}
          <Card padding="md" className="flex items-center justify-between text-left border-white/5 shadow-glass-inner">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-accentPurple/10 border border-accentPurple/20 flex items-center justify-center text-accentPurple shadow-[0_0_10px_rgba(124,58,237,0.1)]">
                <Lock size={16} />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-white">Двухфакторная защита (2FA)</span>
                <span className="text-[9px] text-textSecondary font-semibold mt-0.5">Дополнительная верификация входа</span>
              </div>
            </div>

            <button 
              onClick={handleToggle2FA}
              className={`w-11 h-6 rounded-full p-2 transition-all duration-300 outline-none flex items-center ${
                is2FAEnabled ? 'bg-accent-gradient shadow-glow-purple/50' : 'bg-white/[0.04] border border-white/10'
              }`}
            >
              <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                is2FAEnabled ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </Card>

          {/* Список Активных сессий */}
          <div className="flex flex-col gap-2 text-left">
            <div className="flex justify-between items-center px-2">
              <span className="text-xs font-bold text-white">Активные сессии</span>
              <span className="text-[10px] text-accentPurple font-bold uppercase tracking-widest">{activeSessions.length} сессии</span>
            </div>

            {activeSessions.length > 0 ? (
              <Card padding="none" className="divide-y divide-white/[0.04] shadow-premium">
                {activeSessions.map((session) => (
                  <div key={session.id} className="flex items-start gap-3 p-3 hover-lift">
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

      {/* ================= VIEW 4: ОБЩИЕ НАСТРОЙКИ ================= */}
      {subView === 'settings' && (
        <div className="flex flex-col gap-4 animate-fade-in text-left">
          {/* Шапка */}
          <div className="flex items-center gap-3 text-left">
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
