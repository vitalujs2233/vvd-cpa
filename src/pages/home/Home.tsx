import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wallet, History, ArrowRight, Clock, TrendingUp, Sparkles, Bell, Crown, Heart, Pill, Coins } from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { Button } from '@/shared/ui/Button';
import { getTelegramUser, triggerHaptic } from '@/shared/lib/telegram';

export const Home: React.FC = () => {
  const navigate = useNavigate();
  const user = getTelegramUser();
  console.log("Telegram User:", user);
const [balance, setBalance] = useState({
  available: 0,
  hold: 0,
  paid: 0,
});

useEffect(() => {
  const loadBalance = async () => {
    try {
const res = await fetch(
  `https://vvd-cpa-v2.onrender.com/balance/${user.telegram_id}`
)
      const data = await res.json();

      setBalance({
        available: data.available || 0,
        hold: data.hold || 0,
        paid: data.paid || 0,
      });
    } catch (e) {
      console.error(e);
    }
  };

  loadBalance();
}, []);
  const handleWithdrawClick = () => {
    // Средний по силе виброотклик при открытии формы вывода
    triggerHaptic.mediumImpact();
    navigate('/withdrawal');
  };

  const handleHistoryClick = () => {
    // Легкий виброотклик при переходе в историю
    triggerHaptic.lightImpact();
    navigate('/withdrawal?tab=history');
  };

  const handleNotificationsClick = () => {
    triggerHaptic.lightImpact();
    navigate('/notifications');
  };

  return (
    <div className="flex flex-col gap-4 p-4 select-none pb-24 animate-fade-in">
      
      {/* Верхняя панель пользователя (Шапка) в стиле Luxury Gold */}
      <Card variant="default" padding="sm" className="flex items-center justify-between border-white/5 bg-white/[0.02] backdrop-blur-md rounded-card shadow-glass-inner">
        <div className="flex items-center gap-3">
          {user.photo_url ? (
            <img
              src={user.photo_url}
              alt={user.first_name || 'User'}
              className="w-10 h-10 rounded-full border border-white/10 object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-bgCard border border-accentGold/20 flex items-center justify-center text-accentGoldBright font-semibold text-sm shadow-glass-inner">
              {(user.first_name || 'JD').slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="flex flex-col text-left">
            <span className="text-sm font-bold text-white flex items-center gap-1.5">
              {user.first_name || 'John'} {user.last_name || ''}
              {/* Свечение короны заменено на золотое */}
              <Crown size={12} className="text-accentGoldBright animate-pulse" />
            </span>
            <span className="text-xs text-textSecondary font-semibold">
              {user.username ? `@${user.username}` : 'Пользователь CPA'}
            </span>
          </div>
        </div>

        {/* Кнопка уведомлений с золотым мигающим индикатором */}
        <button 
          onClick={handleNotificationsClick}
          className="relative w-10 h-10 rounded-full bg-white/[0.03] border border-white/5 flex items-center justify-center text-textSecondary hover:text-textPrimary active:scale-95 transition-all duration-200"
        >
          <Bell size={16} />
          <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-accentGoldBright shadow-[0_0_10px_#F6C453] animate-ping" />
          <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-accentGoldBright shadow-[0_0_8px_#F6C453]" />
        </button>
      </Card>

      {/* Парящая градиентная карта Баланса с золотой фоновой короной и золотым свечением */}
      <Card variant="glow" padding="lg" className="flex flex-col gap-5 relative overflow-hidden animate-float">
        {/* Фоновое золотое неоновое свечение */}
        <div className="absolute -right-24 -top-24 w-48 h-48 bg-gold-gradient rounded-full blur-3xl opacity-15 pointer-events-none" />
        
        {/* Большая полупрозрачная фоновая корона, заполняющая пустоту */}
        <div className="absolute -right-6 -bottom-6 text-accentGold/5 pointer-events-none select-none z-0">
          <Crown size={130} className="stroke-[1.5]" />
        </div>

        <div className="flex justify-between items-start z-10">
          <div className="flex flex-col text-left">
            <span className="text-[10px] text-textSecondary font-bold uppercase tracking-wider">Ваш баланс</span>
            <span className="text-[36px] font-bold text-white leading-none mt-1.5 font-sans tracking-tight">
  ${balance.available.toFixed(2)}
</span>
          </div>
          
          <div className="bg-white/[0.02] border border-white/10 rounded-app-xs px-2.5 py-1 flex items-center gap-1.5 shadow-glass-inner">
            <Sparkles size={10} className="text-accentGoldBright animate-spin" style={{ animationDuration: '6s' }} />
            <span className="text-[9px] font-bold text-accentGoldBright uppercase tracking-widest">Premium Partner</span>
          </div>
        </div>

        <div className="h-[1px] bg-white/[0.04] w-full z-10" />

        {/* Финансовые ячейки */}
        <div className="grid grid-cols-3 gap-3 text-left z-10">

  <div className="flex flex-col">
    <span className="text-[9px] text-textSecondary font-bold uppercase tracking-wider">
      Доступно
    </span>

    <span className="text-sm font-bold text-success mt-1">
  ${balance.available.toFixed(2)}
</span>

    <span className="text-[9px] text-textSecondary mt-1">
      Средства подтверждены
    </span>
  </div>

  <div className="flex flex-col">
    <span className="text-[9px] text-textSecondary font-bold uppercase tracking-wider">
      В холде
    </span>

   <span className="text-sm font-bold text-warning mt-1">
  ${balance.hold.toFixed(2)}
</span>

    <span className="text-[9px] text-textSecondary mt-1">
      Ожидают подтверждения
    </span>
  </div>

  <div className="flex flex-col">
    <span className="text-[9px] text-textSecondary font-bold uppercase tracking-wider">
      Выплачено
    </span>

   <span className="text-sm font-bold text-white mt-1">
  ${balance.paid.toFixed(2)}
</span>

    <span className="text-[9px] text-textSecondary mt-1">
      Получено партнёром
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
            className="text-xs text-accentGoldBright hover:text-accentGold hover:scale-[1.01] flex items-center gap-1 transition-all font-semibold"
          >
            Смотреть все
            <ArrowRight size={12} />
          </button>
        </div>

        <Card padding="none" variant="default" className="divide-y divide-white/[0.04] shadow-premium">
          {/* Конверсия 1: Adult Dating */}
          <div className="flex items-center justify-between p-4 text-left hover-lift cursor-pointer">
            <div className="flex items-center gap-3">
              {/* Премиальная сияющая золотая иконка сердца */}
              <div className="w-10 h-10 rounded-full bg-accentGold/10 border border-accentGold/20 flex items-center justify-center text-accentGold shadow-[0_0_10px_rgba(212,175,55,0.15)]">
                <Heart size={16} className="drop-shadow-[0_0_4px_#D4AF37]" />
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
              {/* Премиальная сияющая золотая иконка капсулы */}
              <div className="w-10 h-10 rounded-full bg-accentGold/10 border border-accentGold/20 flex items-center justify-center text-accentGold shadow-[0_0_10px_rgba(212,175,55,0.15)]">
                <Pill size={16} className="drop-shadow-[0_0_4px_#D4AF37]" />
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

          {/* ... */}
          <div className="flex items-center justify-between p-4 text-left hover-lift cursor-pointer">
            <div className="flex items-center gap-3">
              {/* Премиальная сияющая золотая иконка монет */}
              <div className="w-10 h-10 rounded-full bg-accentGold/10 border border-accentGold/20 flex items-center justify-center text-accentGold shadow-[0_0_10px_rgba(212,175,55,0.15)]">
                <Coins size={16} className="drop-shadow-[0_0_4px_#D4AF37]" />
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
          <span className="text-sm font-bold text-white">Новые офферы</span>
          <button
            onClick={() => { triggerHaptic.lightImpact(); navigate('/offers'); }}
            className="text-xs text-accentGoldBright hover:text-accentGold hover:scale-[1.01] flex items-center gap-1 transition-all font-semibold"
          >
            Все офферы
            <ArrowRight size={12} />
          </button>
        </div>

        <Card padding="none" variant="default" className="divide-y divide-white/[0.04] shadow-premium">
          {/* Новый оффер 1 */}
          <div className="flex items-center justify-between p-4 text-left hover-lift cursor-pointer">
            <div className="flex items-center gap-3">
              {/* Премиальная сияющая золотая иконка звезд */}
              <div className="w-10 h-10 rounded-full bg-accentGold/10 border border-accentGold/20 flex items-center justify-center text-accentGold shadow-[0_0_10px_rgba(212,175,55,0.15)]">
                <Sparkles size={16} className="drop-shadow-[0_0_4px_#D4AF37]" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-textPrimary">Mainstream Dating</span>
                <span className="text-[10px] text-textSecondary mt-0.5">Высокая выплата за регистрацию</span>
              </div>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-sm font-bold text-accentGoldBright">$0.85</span>
              <span className="text-[8px] text-textSecondary font-semibold tracking-wider mt-0.5 uppercase">EPC: $0.12</span>
            </div>
          </div>

          {/* Новый оффер 2 */}
          <div className="flex items-center justify-between p-4 text-left hover-lift cursor-pointer">
            <div className="flex items-center gap-3">
              {/* Премиальная сияющая золотая иконка капсулы */}
              <div className="w-10 h-10 rounded-full bg-accentGold/10 border border-accentGold/20 flex items-center justify-center text-accentGold shadow-[0_0_10px_rgba(212,175,55,0.15)]">
                <Pill size={16} className="drop-shadow-[0_0_4px_#D4AF37]" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-textPrimary">Nutra Sweepstakes</span>
                <span className="text-[10px] text-textSecondary mt-0.5">Выплата за CC-Submit (кредитки)</span>
              </div>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-sm font-bold text-accentGoldBright">$0.75</span>
              <span className="text-[8px] text-textSecondary font-semibold tracking-wider mt-0.5 uppercase">EPC: $0.09</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
