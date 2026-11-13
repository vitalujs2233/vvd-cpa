import { useNavigate } from 'react-router-dom';
import React,{useEffect,useState} from 'react';
import {apiRequest} from '@/shared/lib/api';
import {readApiSnapshot} from '@/shared/lib/viewSnapshot';
import { LogOut, Lock, Shield, User, Coins, Sparkles, Crown, MessageSquare, Globe } from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { getTelegramUser, triggerHaptic } from '@/shared/lib/telegram';
import {LOCALE_SWITCH_ENABLED,useLocale,setLocale,localize} from '@/shared/lib/locale';

export const Profile: React.FC = () => {
  const navigate = useNavigate();
  const lang=useLocale();
  const t=(ru:string,en:string)=>localize(lang,ru,en);
  const telegramUser = getTelegramUser();
  const referralPath='/referral/'+telegramUser.id;
  const [referralBalance,setReferralBalance]=useState<number|null>(()=>{
    const cached=readApiSnapshot<{balance?:number}>(referralPath);
    return typeof cached?.balance==='number'&&Number.isFinite(cached.balance)?cached.balance:null;
  });
  useEffect(()=>{
    let active=true;
    void apiRequest<{balance?:number}>(referralPath).then(data=>{
      if(active&&typeof data.balance==='number'&&Number.isFinite(data.balance))setReferralBalance(data.balance);
    }).catch(()=>{/* Unknown amount stays hidden, never a false $0.00. */});
    return()=>{active=false;};
  },[referralPath]);

  const profileName = `${telegramUser.first_name || ''} ${telegramUser.last_name || ''}`.trim() || 'Пользователь Telegram';
  const profileUsername = telegramUser.username;

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

  const handleLogout = () => {
    triggerHaptic.mediumImpact();
    navigate('/');
  };

  return (
    <div className="flex flex-col gap-4 p-4 select-none pb-24">
      
      {/* ================= VIEW 1: ГЛАВНЫЙ ЭКРАН ПРОФИЛЯ ================= */}
      {(
        <div className="flex flex-col gap-4 animate-fade-in">
          {/* Шапка Профиля */}
          <div className="flex flex-col text-left">
            <span className="text-[10px] text-textSecondary font-bold uppercase tracking-wider">{t('Ваш аккаунт','Your account')}</span>
            <h1 className="text-2xl font-bold text-white mt-1">{t('Кабинет','Account')}</h1>
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
        {referralBalance===null?'—':String.fromCharCode(36)+referralBalance.toFixed(2)}
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
                  <span className="text-xs font-semibold text-white">{t('Изменить профиль','Edit profile')}</span>
                </div>
                <Lock size={17} className="text-textSecondary" aria-label="Заблокировано" />
              </div>

              {/* Paused until all user-facing pages/media are translated. Keep this selector ready. */}
              {LOCALE_SWITCH_ENABLED&&<div className="flex items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Globe size={16} className="shrink-0 text-accentGold"/>
                  <span className="text-xs font-semibold text-white">{t('Язык интерфейса','Interface language')}</span>
                </div>
                <div className="inline-flex shrink-0 rounded-xl border border-accentGold/30 bg-accentGold/5 p-1" role="group" aria-label={t('Выбор языка','Language selection')}>
                  {(['ru','en'] as const).map(code=><button key={code} type="button" aria-pressed={lang===code}
                    onClick={()=>setLocale(code)}
                    className={`min-w-[37px] rounded-lg px-2 py-1.5 text-xs font-bold ${lang===code?'bg-accentGold text-black':'text-accentGoldBright'}`}>{code.toUpperCase()}</button>)}
                </div>
              </div>}

              {/* Личный чат поддержки (Новое расположение по гайдлайну v2.0) */}
              <div 
                onClick={handleNavigateToSupport}
                className="flex items-center justify-between p-4 hover:bg-white/[0.01] active:bg-white/[0.02] cursor-pointer transition-colors duration-150"
              >
                <div className="flex items-center gap-3">
                  <MessageSquare size={16} className="text-accentGold" />
                  <span className="text-xs font-semibold text-white">{t('Связаться с поддержкой','Contact support')}</span>
                </div>
                <span className="text-[9px] text-textSecondary font-bold uppercase tracking-wider">{t('Написать','Message')}</span>
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

    </div>
  );
};

