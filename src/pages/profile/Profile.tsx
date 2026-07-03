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

  // Состояния общих настроек (Раздел 8)
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
    
    // Сбрасываем плашку успешного сохранения
    setTimeout(() => {
      setSaveSuccess(false);
    }, 2500);
  };

  const handleLogout = () => {
    triggerHaptic.mediumImpact();
    // Эмуляция выхода: перенаправление на главную
    navigate('/');
  };

  return (
    <div className="flex flex-col gap-16 p-16 select-none pb-24">
      
      {/* ================= VIEW 1: ГЛАВНЫЙ ЭКРАН ПРОФИЛЯ (Раздел 5) ================= */}
      {subView === 'main' && (
        <div className="flex flex-col gap-16">
          {/* Шапка Профиля */}
          <div className="text-left">
            <h1 className="text-2xl font-bold text-white">Профиль</h1>
            <p className="text-xs text-textMuted mt-1">Управление аккаунтом и личными настройками</p>
          </div>

          {/* Карточка пользователя с данными из Telegram */}
          <Card padding="md" className="flex items-center gap-12 text-left relative overflow-hidden">
            <div className="absolute -right-16 -top-16 w-32 h-32 bg-accent/5 rounded-full blur-2xl pointer-events-none" />
            
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
              <span className="text-xs text-textMuted mt-0.5">@{profileUsername}</span>
              <span className="text-[10px] text-accent font-semibold mt-1">ID: 123456 • Рег. 25.05.2024</span>
            </div>
          </Card>

          {/* Финансовая сводка по макету */}
          <Card padding="sm" className="grid grid-cols-3 gap-8 text-center divide-x divide-gray-800/40">
            <div className="flex flex-col items-center justify-center py-1">
              <span className="text-[9px] text-textMuted uppercase font-semibold">Баланс</span>
              <span className="text-xs font-bold text-white mt-1">$154.50</span>
            </div>
            <div className="flex flex-col items-center justify-center py-1">
              <span className="text-[9px] text-textMuted uppercase font-semibold">Hold</span>
              <span className="text-xs font-bold text-warning mt-1">$32.40</span>
            </div>
            <div className="flex flex-col items-center justify-center py-1">
              <span className="text-[9px] text-textMuted uppercase font-semibold">Выплачено</span>
              <span className="text-xs font-bold text-textSec mt-1">$1,234.50</span>
            </div>
          </Card>

          {/* Меню настроек профиля (Раздел 5 меню) */}
          <div className="flex flex-col gap-12">
            <Card padding="none" className="divide-y divide-gray-800/40 text-left">
              {/* Настройки профиля */}
              <div 
                onClick={() => handleSubViewChange('edit')}
                className="flex items-center justify-between p-12 hover:bg-white/[0.01] active:bg-white/[0.03] cursor-pointer transition-colors duration-150"
              >
                <div className="flex items-center gap-12">
                  <User size={16} className="text-accent" />
                  <span className="text-xs font-semibold text-white">Изменить профиль</span>
                </div>
                <span className="text-[10px] text-textMuted font-medium">Редактировать</span>
              </div>

              {/* Безопасность */}
              <div 
                onClick={() => handleSubViewChange('security')}
                className="flex items-center justify-between p-12 hover:bg-white/[0.01] active:bg-white/[0.03] cursor-pointer transition-colors duration-150"
              >
                <div className="flex items-center gap-12">
                  <Shield size={16} className="text-accent" />
                  <span className="text-xs font-semibold text-white">Безопасность</span>
                </div>
                <span className="text-[10px] text-success font-bold flex items-center gap-1">
                  <CheckCircle2 size={10} />
                  2FA {is2FAEnabled ? 'Активна' : 'Выкл'}
                </span>
              </div>

              {/* Общие настройки */}
              <div 
                onClick={() => handleSubViewChange('settings')}
                className="flex items-center justify-between p-12 hover:bg-white/[0.01] active:bg-white/[0.03] cursor-pointer transition-colors duration-150"
              >
                <div className="flex items-center gap-12">
                  <Settings size={16} className="text-accent" />
                  <span className="text-xs font-semibold text-white">Общие настройки</span>
                </div>
                <span className="text-[10px] text-textMuted font-medium">Язык, Кэш, Тема</span>
              </div>
            </Card>

            {/* Выйти */}
            <Card padding="none" className="text-left border-error/10 bg-error/[0.02]">
              <div 
                onClick={handleLogout}
                className="flex items-center gap-12 p-12 hover:bg-error/[0.03] active:bg-error/[0.05] cursor-pointer transition-colors duration-150"
              >
                <LogOut size={16} className="text-error" />
                <span className="text-xs font-bold text-error">Выйти из аккаунта</span>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ================= VIEW 2: НАСТРОЙКИ ПРОФИЛЯ (Раздел 5.2) ================= */}
      {subView === 'edit' && (
        <div className="flex flex-col gap-16 animate-fade-in">
          {/* Шапка */}
          <div className="flex items-center gap-12 text-left">
            <button 
              onClick={() => handleSubViewChange('main')}
              className="w-10 h-10 rounded-app-xs bg-bgCard border border-gray-800/40 flex items-center justify-center text-textSec active:scale-95 transition-transform"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="flex flex-col">
              <span className="text-[10px] text-accent font-semibold uppercase tracking-wider">Профиль</span>
              <h1 className="text-xl font-bold text-white leading-none">Редактировать профиль</h1>
            </div>
          </div>

          {/* Форма ввода настроек */}
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
          <div className={`flex items-center gap-6 text-[10px] text-success transition-all duration-300 px-1 font-medium justify-center ${saveSuccess ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1 h-0 pointer-events-none'}`}>
            <CheckCircle2 size={12} />
            <span>Данные профиля успешно обновлены!</span>
          </div>

          <Button 
            variant="primary" 
            size="lg" 
            className="h-12 mt-4"
            onClick={handleSaveProfile}
          >
            Сохранить настройки
          </Button>
        </div>
      )}

      {/* ================= VIEW 3: НАСТРОЙКИ БЕЗОПАСНОСТИ (Раздел 5.1) ================= */}
      {subView === 'security' && (
        <div className="flex flex-col gap-16 animate-fade-in">
          {/* Шапка */}
          <div className="flex items-center gap-12 text-left">
            <button 
              onClick={() => handleSubViewChange('main')}
              className="w-10 h-10 rounded-app-xs bg-bgCard border border-gray-800/40 flex items-center justify-center text-textSec active:scale-95 transition-transform"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="flex flex-col">
              <span className="text-[10px] text-accent font-semibold uppercase tracking-wider">Профиль</span>
              <h1 className="text-xl font-bold text-white leading-none">Безопасность</h1>
            </div>
          </div>

          {/* Переключатель 2FA */}
          <Card padding="md" className="flex items-center justify-between text-left">
            <div className="flex items-center gap-12">
              <div className="w-8 h-8 rounded-app-xs bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
                <Lock size={16} />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-white">Двухфакторная аутентификация</span>
                <span className="text-[9px] text-textMuted mt-0.5">Защита личного кабинета (2FA)</span>
              </div>
            </div>

            {/* Нативный тумблер (Switch) на Tailwind */}
            <button 
              onClick={handleToggle2FA}
              className={`w-11 h-6 rounded-full p-2 transition-colors duration-200 outline-none ${
                is2FAEnabled ? 'bg-accent' : 'bg-gray-800'
              }`}
            >
              <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                is2FAEnabled ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </Card>

          {/* Список Активных сессий */}
          <div className="flex flex-col gap-8 text-left">
            <div className="flex justify-between items-center px-1">
              <span className="text-xs font-bold text-white">Активные сессии</span>
              <span className="text-[10px] text-accent font-semibold">{activeSessions.length} сессии</span>
            </div>

            {activeSessions.length > 0 ? (
              <Card padding="none" className="divide-y divide-gray-800/40">
                {activeSessions.map((session) => (
                  <div key={session.id} className="flex items-start gap-12 p-12">
                    <div className="w-8 h-8 rounded-app-xs bg-bgDark border border-gray-800/40 flex items-center justify-center text-textMuted shrink-0">
                      <Smartphone size={16} />
                    </div>
                    <div className="flex flex-col text-left">
                      <span className="text-xs font-bold text-white">{session.device}</span>
                      <span className="text-[9px] text-textMuted mt-0.5">{session.location}</span>
                    </div>
                  </div>
                ))}
              </Card>
            ) : (
              <Card padding="md" className="text-center text-xs text-textMuted border-dashed">
                Все сессии, кроме текущей, успешно завершены.
              </Card>
            )}
          </div>

          <Button 
            variant="secondary" 
            size="lg" 
            className="h-12 mt-4 border border-gray-800 bg-transparent text-textSec hover:bg-white/[0.01]"
            onClick={handleTerminateSessions}
            disabled={activeSessions.length === 0}
          >
            Завершить все сессии
          </Button>
        </div>
      )}

      {/* ================= VIEW 4: ОБЩИЕ НАСТРОЙКИ (Раздел 8) ================= */}
      {subView === 'settings' && (
        <div className="flex flex-col gap-16 animate-fade-in text-left">
          {/* Шапка */}
          <div className="flex items-center gap-12 text-left">
            <button 
              onClick={() => handleSubViewChange('main')}
              className="w-10 h-10 rounded-app-xs bg-bgCard border border-gray-800/40 flex items-center justify-center text-textSec active:scale-95 transition-transform"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="flex flex-col">
              <span className="text-[10px] text-accent font-semibold uppercase tracking-wider">Профиль</span>
              <h1 className="text-xl font-bold text-white leading-none">Общие настройки</h1>
            </div>
          </div>

          {/* Меню тумблеров уведомлений */}
          <div className="flex flex-col gap-8">
            <span className="text-xs font-bold text-white px-1">Уведомления</span>
            <Card padding="none" className="divide-y divide-gray-800/40">
              {/* Push уведомления */}
              <div className="flex items-center justify-between p-12">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white">Push уведомления</span>
                  <span className="text-[9px] text-textMuted mt-0.5">Уведомления о новых конверсиях</span>
                </div>
                <button 
                  onClick={() => { triggerHaptic.lightImpact(); setPushEnabled(!pushEnabled); }}
                  className={`w-11 h-6 rounded-full p-2 transition-colors duration-200 outline-none ${
                    pushEnabled ? 'bg-accent' : 'bg-gray-800'
                  }`}
                >
                  <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                    pushEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* Email уведомления */}
              <div className="flex items-center justify-between p-12">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white">Email уведомления</span>
                  <span className="text-[9px] text-textMuted mt-0.5">Отчеты по балансу на почту</span>
                </div>
                <button 
                  onClick={() => { triggerHaptic.lightImpact(); setEmailNotificationEnabled(!emailNotificationEnabled); }}
                  className={`w-11 h-6 rounded-full p-2 transition-colors duration-200 outline-none ${
                    emailNotificationEnabled ? 'bg-accent' : 'bg-gray-800'
                  }`}
                >
                  <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                    emailNotificationEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </button>
              </div>
            </Card>
          </div>

          {/* Системные настройки */}
          <div className="flex flex-col gap-8">
            <span className="text-xs font-bold text-white px-1">Системные</span>
            <Card padding="none" className="divide-y divide-gray-800/40">
              {/* Язык интерфейса */}
              <div className="flex items-center justify-between p-12">
                <span className="text-xs font-bold text-white">Язык</span>
                <span className="text-xs font-bold text-accent">{language}</span>
              </div>

              {/* Валюта */}
              <div className="flex items-center justify-between p-12">
                <span className="text-xs font-bold text-white">Валюта статистики</span>
                <span className="text-xs font-bold text-accent">{currency}</span>
              </div>

              {/* Кэш приложения */}
              <div 
                onClick={handleClearCache}
                className="flex items-center justify-between p-12 hover:bg-white/[0.01] active:bg-white/[0.03] cursor-pointer transition-colors"
              >
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white">Очистить кэш</span>
                  <span className="text-[9px] text-textMuted mt-0.5">Освободить память устройства</span>
                </div>
                <span className={`text-xs font-bold ${cacheSize === '0 MB' ? 'text-textMuted' : 'text-accent'}`}>
                  {cacheSize}
                </span>
              </div>
            </Card>
          </div>

          {/* Удаление аккаунта */}
          <div className="flex flex-col gap-8 mt-4">
            <Card padding="none" className="border-error/10 bg-error/[0.01]">
              <div className="flex items-center justify-between p-12">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-error">Удалить аккаунт</span>
                  <span className="text-[9px] text-error/60 mt-0.5">Это действие необратимо</span>
                </div>
                <Button 
                  variant="danger" 
                  size="sm" 
                  onClick={() => triggerHaptic.error()}
                  className="bg-error/15 border border-error/20 text-error hover:bg-error/30"
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
