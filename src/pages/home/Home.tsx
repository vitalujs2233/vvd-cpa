import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Wallet, History, ArrowRight, Clock, TrendingUp, 
  Sparkles, Bell, Crown, Heart, Pill, Coins 
} from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { Button } from '@/shared/ui/Button';
import { getTelegramUser, triggerHaptic } from '@/shared/lib/telegram';

export const Home: React.FC = () => {
  const navigate = useNavigate();
  const user = getTelegramUser();

  const handleWithdrawClick = () => {
    triggerHaptic.mediumImpact();
    navigate('/withdrawal');
  };

  const handleHistoryClick = () => {
    triggerHaptic.lightImpact();
    navigate('/withdrawal?tab=history');
  };

  const handleNotificationsClick = () => {
    triggerHaptic.lightImpact();
    navigate('/notifications');
  };

  return (
    <div className="flex flex-col gap-4 p-4 select-none pb-24 animate-fade-in">
      
      {/* Верхняя панель пользователя (Шапка) */}
      <Card variant="default" padding="sm" className="flex items-center justify-between border-white/5 bg-white/[0.02] backdrop-blur-md rounded-card shadow-glass-inner">
        <div className="flex items-center gap-3">
          {user.photo_url ? (
            <img
              src={user.photo_url}
              alt={user.first_name || 'User'}
              className="w-10 h-10 rounded-full border border-gray-800 object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-accentDark border border-accent/20 flex items-center justify-center text-accent font-semibold text-sm">
              {(user.first_name || 'JD').slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="flex flex-col text-left">
            <span className="text-sm font-bold text-white flex items-center gap-1.5">
              {user.first_name || 'John'} {user.last_name || ''}
              <Crown size={12} className="text-accentPink" />
            </span>
            <span className="text-xs text-textSecondary font-semibold">
              {user.username ? `@${user.username}` : 'Пользователь CPA'}
            </span>
          </div>
        </div>

        {/* Кнопка уведомлений */}
        <button 
          onClick={handleNotificationsClick}
          className="relative w-10 h-10 rounded-full bg-white/[0.03] border border-white/5 flex items-center justify-center text-textSecondary hover:text-textPrimary active:scale-95 transition-all duration-200"
        >
          <Bell size={16} />
          <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-accentPurple shadow-[0_0_10px_#7C3AED] animate-ping" />
          <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-accentPurple shadow-[0_0_8px_#7C3AED]" />
        </button>
      </Card>

      {/* Парящая градиентная карта Баланса с отполированной фаской и фоновой короной */}
      <Card variant="glow" padding="lg" className="flex flex-col gap-5 relative overflow-hidden animate-float">
        {/* Фоновое неоновое свечение */}
        <div className="absolute -right-24 -top-24 w-48 h-48 bg-accent-gradient rounded-full blur-3xl opacity-10 pointer-events-none" />
        
        {/* Большая полупрозрачная фоновая корона, заполняющая пустоту по гайдлайну */}
        <div className="absolute -right-6 -bottom-6 text-accentPurple/5 pointer-events-none select-none z-0">
          <Crown size={130} className="stroke-[1.5]" />
        </div>

        <div className="flex justify-between items-start z-10">
          <div className="flex flex-col text-left">
            <span className="text-[10px] text-textSecondary font-bold uppercase tracking-wider">Ваш баланс</span>
            <span className="text-[36px] font-bold text-white leading-none mt-1.5 font-sans tracking-tight">
              $154.50
            </span>
          </div>
          
          <div className="bg-accent-gradient/10 border border-accentPink/20 rounded-app-xs px-2.5 py-1 flex items-center gap-1.5">
            <Sparkles size={10} className="text-accentPink animate-spin" style={{ animationDuration: '6s' }} />
            <span className="text-[9px] font-bold text-white uppercase tracking-widest">Premium Partner</span>
          </div>
        </div>

        <div className="h-[1px] bg-white/[0.04] w-full z-10" />

        {/* Финансовые ячейки */}
        <div className="grid grid-cols-2 gap-3 text-left z-10">
          <div className="flex flex-col">
            <span className="text-[9px] text-textSecondary font-bold uppercase tracking-wider">Hold сегодня</span>
            <span className="text-sm font-bold text-warning mt-1 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-warning shadow-[0_0_8px_#F59E0B] animate-pulse" />
              $32.40
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] text-textSecondary font-bold uppercase tracking-wider">Выплачено</span>
            <span className="text-sm font-bold text-textSec mt-1 flex items-center gap-1.5">
              <TrendingUp size={14} className="text-success" />
              $1,234.50
            </span>
          </div>
        </div>

        {/* Кнопки вывода */}
        <div className="grid grid-cols-2 gap-3 mt-2 shrink-0 z-10">
          <Button variant="primary" size="lg" onClick={handleWithdrawClick} className="w-full">
            <Wallet size={16} className="mr-2" />
            Вывести
          </Button>
          <Button variant="secondary" size="lg" onClick={handleHistoryClick} className="w-full">
            <History size={16} className="mr-2" />
            История
          </Button>
        </div>
      </Card>

      {/* Секция: Последние конверсии */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <span className="text-sm font-bold text-white">Последние конверсии</span>
          <button
            onClick={() => { triggerHaptic.lightImpact(); navigate('/stats'); }}
            className="text-xs text-accentPurple hover:text-accentViolet hover:scale-[1.01] flex items-center gap-1 transition-all font-semibold"
          >
            Смотреть все
            <ArrowRight size={12} />
          </button>
        </div>

        <Card padding="none" variant="default" className="divide-y divide-white/[0.04] shadow-premium">
          {/* Конверсия 1: Adult Dating */}
          <div className="flex items-center justify-between p-4 text-left hover-lift cursor-pointer">
            <div className="flex items-center gap-3">
              {/* Премиальная сияющая иконка сердца */}
              <div className="w-10 h-10 rounded-full bg-error/10 border border-error/20 flex items-center justify-center text-error shadow-[0_0_10px_rgba(239,68,68,0.15)]">
                <Heart size={16} className="drop-shadow-[0_0_4px_#EF4444]" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-textPrimary">Adult Dating</span>
                <span className="text-[10px] text-textSecondary flex items-center gap-1.5 mt-0.5">
                  <Clock size={10} />
                  2 минуты назад
                </span>
              </div>
            </div>
            <span className="text-sm font-bold text-success">+$12.50</span>
          </div>

          {/* Конверсия 2: Nutra Offer */}
          <div className="flex items-center justify-between p-4 text-left hover-lift cursor-pointer">
            <div className="flex items-center gap-3">
              {/* Премиальная сияющая иконка капсулы */}
              <div className="w-10 h-10 rounded-full bg-success/10 border border-success/20 flex items-center justify-center text-success shadow-[0_0_10px_rgba(34,197,94,0.15)]">
                <Pill size={16} className="drop-shadow-[0_0_4px_#22C55E]" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-textPrimary">Nutra Offer</span>
                <span className="text-[10px] text-textSecondary flex items-center gap-1.5 mt-0.5">
                  <Clock size={10} />
                  15 минут назад
                </span>
              </div>
            </div>
            <span className="text-sm font-bold text-success">+$8.30</span>
          </div>

          {/* Конверсия 3: Crypto Trading */}
          <div className="flex items-center justify-between p-4 text-left hover-lift cursor-pointer">
            <div className="flex items-center gap-3">
              {/* Премиальная сияющая иконка золотых монет */}
              <div className="w-10 h-10 rounded-full bg-accentPurple/10 border border-accentPurple/20 flex items-center justify-center text-accentPurple shadow-[0_0_10px_rgba(124,58,237,0.15)]">
                <Coins size={16} className="drop-shadow-[0_0_4px_#7C3AED]" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-textPrimary">Crypto Trading</span>
                <span className="text-[10px] text-textSecondary flex items-center gap-1.5 mt-0.5">
                  <Clock size={10} />
                  1 час назад
                </span>
              </div>
            </div>
            <span className="text-sm font-bold text-success">+$15.20</span>
          </div>
        </Card>
      </div>

      {/* Секция: Новые офферы */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <span className="text-sm font-bold text-textPrimary">Новые офферы</span>
          <button
            onClick={() => { triggerHaptic.lightImpact(); navigate('/offers'); }}
            className="text-xs text-accentPurple hover:text-accentViolet hover:scale-[1.01] flex items-center gap-1 transition-all font-semibold"
          >
            Все офферы
            <ArrowRight size={12} />
          </button>
        </div>

        <Card padding="none" variant="default" className="divide-y divide-white/[0.04] shadow-premium">
          {/* Новый оффер 1 */}
          <div className="flex items-center justify-between p-4 text-left hover-lift cursor-pointer">
            <div className="flex items-center gap-3">
              {/* Премиальная сияющая иконка звезд */}
              <div className="w-10 h-10 rounded-full bg-warning/10 border border-warning/20 flex items-center justify-center text-warning shadow-[0_0_10px_rgba(245,158,11,0.15)]">
                <Sparkles size={16} className="drop-shadow-[0_0_4px_#F59E0B]" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-textPrimary">Mainstream Dating</span>
                <span className="text-[10px] text-textSecondary mt-0.5">Высокая выплата за регистрацию</span>
              </div>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-sm font-bold text-accentPurple">$0.85</span>
              <span className="text-[8px] text-textSecondary font-semibold tracking-wider mt-0.5 uppercase">EPC: $0.12</span>
            </div>
          </div>

          {/* Новый оффер 2 */}
          <div className="flex items-center justify-between p-4 text-left hover-lift cursor-pointer">
            <div className="flex items-center gap-3">
              {/* Премиальная сияющая иконка капсулы */}
              <div className="w-10 h-10 rounded-full bg-accentPink/10 border border-accentPink/20 flex items-center justify-center text-accentPink shadow-[0_0_10px_rgba(192,38,211,0.15)]">
                <Pill size={16} className="drop-shadow-[0_0_4px_#C026D3]" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-textPrimary">Nutra Sweepstakes</span>
                <span className="text-[10px] text-textSecondary mt-0.5">Выплата за CC-Submit (кредитки)</span>
              </div>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-sm font-bold text-accentPurple">$0.75</span>
              <span className="text-[8px] text-textSecondary font-semibold tracking-wider mt-0.5 uppercase">EPC: $0.09</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
