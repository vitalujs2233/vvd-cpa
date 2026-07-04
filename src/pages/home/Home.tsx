import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Wallet, History, ArrowRight, Clock, TrendingUp, Sparkles, Bell, Crown } from 'lucide-react';
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
    // Заменили внешние отступы с гигантских 64px (p-16) на аккуратные 16px (p-4), а gap-16 на gap-4
    <div className="flex flex-col gap-4 p-4 select-none pb-24 animate-fade-in">
      
      {/* Люксовый парящий Header (Glass Background, Blur, иконка уведомлений) */}
      <Card variant="default" padding="sm" className="flex items-center justify-between border-white/5 bg-white/[0.02] backdrop-blur-md rounded-card shadow-glass-inner">
        <div className="flex items-center gap-3">
          {user.photo_url ? (
            <img
              src={user.photo_url}
              alt={user.first_name || 'User'}
              className="w-11 h-11 rounded-full border border-white/10 object-cover shadow-premium"
            />
          ) : (
            <div className="w-11 h-11 rounded-full bg-accent-gradient flex items-center justify-center text-white font-bold text-sm shadow-glow-purple/40">
              {(user.first_name || 'JD').slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="flex flex-col text-left">
            <span className="text-sm font-bold text-textPrimary flex items-center gap-1.5">
              {user.first_name || 'John'} {user.last_name || ''}
              <Crown size={12} className="text-accentPink animate-pulse" />
            </span>
            <span className="text-[10px] text-textSecondary font-semibold uppercase tracking-wider mt-0.5">
              {user.username ? `@${user.username}` : 'CPA Partner'}
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

      {/* Парящая градиентная карта Баланса (gap-20 заменен на gap-5 (20px), убран гигантский раздув) */}
      <Card variant="glow" padding="lg" className="flex flex-col gap-5 relative overflow-hidden animate-float">
        <div className="absolute -right-24 -top-24 w-48 h-48 bg-accent-gradient rounded-full blur-3xl opacity-10 pointer-events-none" />

        <div className="flex justify-between items-start">
          <div className="flex flex-col text-left">
            <span className="text-[10px] text-textSecondary font-bold uppercase tracking-wider">Ваш баланс</span>
            <span className="text-[36px] font-bold text-white bg-clip-text mt-1 font-sans tracking-tight leading-none">
              $154.50
            </span>
          </div>
          
          <div className="bg-accent-gradient/10 border border-accentPink/20 rounded-app-xs px-2.5 py-1 flex items-center gap-1.5">
            <Sparkles size={10} className="text-accentPink animate-spin" style={{ animationDuration: '6s' }} />
            <span className="text-[9px] font-bold text-textPrimary uppercase tracking-widest">Premium Partner</span>
          </div>
        </div>

        <div className="h-[1px] bg-white/[0.04] w-full" />

        {/* Финансовые ячейки (gap-12 заменен на gap-3) */}
        <div className="grid grid-cols-2 gap-3 text-left">
          <div className="flex flex-col">
            <span className="text-[9px] text-textSecondary font-bold uppercase tracking-wider">Hold сегодня</span>
            <span className="text-sm font-bold text-warning mt-1 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
              $32.40
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] text-textSecondary font-bold uppercase tracking-wider">Выплачено</span>
            <span className="text-sm font-bold text-success mt-1 flex items-center gap-1.5">
              <TrendingUp size={14} className="text-success" />
              $1,234.50
            </span>
          </div>
        </div>

        {/* Кнопки вывода */}
        <div className="grid grid-cols-2 gap-3 mt-2 shrink-0">
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
          <span className="text-sm font-bold text-textPrimary">Последние конверсии</span>
          <button
            onClick={() => { triggerHaptic.lightImpact(); navigate('/stats'); }}
            className="text-xs text-accentPurple hover:text-accentViolet hover:scale-[1.01] flex items-center gap-1 transition-all font-semibold"
          >
            Смотреть все
            <ArrowRight size={12} />
          </button>
        </div>

        <Card padding="none" variant="default" className="divide-y divide-white/[0.04] shadow-premium">
          <div className="flex items-center justify-between p-4 text-left hover-lift cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-app-xs bg-error/10 border border-error/20 flex items-center justify-center text-error font-bold text-xs">
                AD
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

          <div className="flex items-center justify-between p-4 text-left hover-lift cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-app-xs bg-success/10 border border-success/20 flex items-center justify-center text-success font-bold text-xs">
                NT
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

          <div className="flex items-center justify-between p-4 text-left hover-lift cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-app-xs bg-accent/10 border border-accent/20 flex items-center justify-center text-accentPurple font-bold text-xs">
                CR
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
          <div className="flex items-center justify-between p-4 text-left hover-lift cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-app-xs bg-white/[0.03] border border-white/5 flex items-center justify-center text-textSecondary font-bold text-xs">
                MD
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-textPrimary">Mainstream Dating</span>
                <span className="text-[10px] text-textSecondary mt-0.5">Высокая выплата за лид CPL</span>
              </div>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-sm font-bold text-accentPurple">$0.85</span>
              <span className="text-[8px] text-textSecondary font-semibold tracking-wider mt-0.5 uppercase">EPC: $0.12</span>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 text-left hover-lift cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-app-xs bg-white/[0.03] border border-white/5 flex items-center justify-center text-textSecondary font-bold text-xs">
                NU
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-textPrimary">Nutra Sweepstakes</span>
                <span className="text-[10px] text-textSecondary mt-0.5">Выплата за СС-Submit (кредитки)</span>
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
