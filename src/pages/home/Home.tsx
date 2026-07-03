import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Wallet, History, ArrowRight, Clock, TrendingUp, Sparkles } from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { Button } from '@/shared/ui/Button';
import { getTelegramUser, triggerHaptic } from '@/shared/lib/telegram';

export const Home: React.FC = () => {
  const navigate = useNavigate();
  const user = getTelegramUser();

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

  return (
    <div className="flex flex-col gap-16 p-16 select-none pb-24">
      {/* Верхняя панель пользователя (Шапка) */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-12">
          {user.photo_url ? (
            <img
              src={user.photo_url}
              alt={user.first_name}
              className="w-10 h-10 rounded-full border border-gray-800 object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-accentDark border border-accent/20 flex items-center justify-center text-accent font-semibold text-sm">
              {user.first_name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="flex flex-col text-left">
            <span className="text-sm font-bold text-white">
              {user.first_name} {user.last_name || ''}
            </span>
            <span className="text-xs text-textMuted">
              {user.username ? `@${user.username}` : 'Пользователь CPA'}
            </span>
          </div>
        </div>

        {/* Демо плашка версии */}
        <div className="bg-accentDark/40 border border-accent/20 rounded-app-xs px-2.5 py-1 flex items-center gap-1.5">
          <Sparkles size={12} className="text-accent animate-pulse" />
          <span className="text-[10px] font-semibold text-accent uppercase tracking-wider">Demo V1.0</span>
        </div>
      </div>

      {/* Главная карточка Баланса */}
      <Card variant="default" padding="lg" className="flex flex-col gap-16 relative overflow-hidden">
        {/* Декоративный полупрозрачный круг для эстетики интерфейса */}
        <div className="absolute -right-20 -top-20 w-40 h-40 bg-accent/5 rounded-full blur-2xl pointer-events-none" />

        <div className="flex justify-between items-start">
          <div className="flex flex-col text-left">
            <span className="text-xs text-textMuted uppercase tracking-wider font-semibold">Баланс</span>
            <span className="text-[32px] font-bold text-white leading-none mt-1.5">$154.50</span>
          </div>
          <div className="flex flex-col text-right">
            <span className="text-xs text-textMuted uppercase tracking-wider font-semibold">Hold</span>
            <span className="text-base font-bold text-warning mt-1.5">$32.40</span>
          </div>
        </div>

        {/* Горизонтальный разделитель */}
        <div className="h-[1px] bg-gray-800/40 w-full" />

        {/* Дополнительная финансовая статистика */}
        <div className="grid grid-cols-2 gap-12 text-left">
          <div className="flex flex-col">
            <span className="text-[10px] text-textMuted uppercase font-semibold">Доход сегодня</span>
            <span className="text-base font-bold text-success mt-0.5 flex items-center gap-1">
              <TrendingUp size={14} />
              $23.40
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-textMuted uppercase font-semibold">Выплачено</span>
            <span className="text-base font-bold text-textSec mt-0.5">$1,234.50</span>
          </div>
        </div>

        {/* Кнопки вывода и истории */}
        <div className="grid grid-cols-2 gap-8 mt-4">
          <Button variant="primary" size="md" onClick={handleWithdrawClick} className="w-full">
            <Wallet size={16} className="mr-2" />
            Вывести
          </Button>
          <Button variant="outline" size="md" onClick={handleHistoryClick} className="w-full">
            <History size={16} className="mr-2" />
            История
          </Button>
        </div>
      </Card>

      {/* Секция: Последние конверсии */}
      <div className="flex flex-col gap-12">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-white">Последние конверсии</span>
          <button
            onClick={() => { triggerHaptic.lightImpact(); navigate('/stats'); }}
            className="text-xs text-accent hover:text-accent/80 flex items-center gap-1 transition-colors font-medium"
          >
            Смотреть все
            <ArrowRight size={12} />
          </button>
        </div>

        <Card padding="none" className="divide-y divide-gray-800/40">
          {/* Конверсия 1 */}
          <div className="flex items-center justify-between p-12 text-left">
            <div className="flex items-center gap-12">
              <div className="w-8 h-8 rounded-app-xs bg-accentDark/50 border border-accent/10 flex items-center justify-center text-accent text-xs font-bold">
                AD
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-white">Adult Dating</span>
                <span className="text-[10px] text-textMuted flex items-center gap-1 mt-0.5">
                  <Clock size={10} />
                  2 минуты назад
                </span>
              </div>
            </div>
            <span className="text-xs font-bold text-success">+$12.50</span>
          </div>

          {/* Конверсия 2 */}
          <div className="flex items-center justify-between p-12 text-left">
            <div className="flex items-center gap-12">
              <div className="w-8 h-8 rounded-app-xs bg-accentDark/50 border border-accent/10 flex items-center justify-center text-accent text-xs font-bold">
                NT
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-white">Nutra Offer</span>
                <span className="text-[10px] text-textMuted flex items-center gap-1 mt-0.5">
                  <Clock size={10} />
                  15 минут назад
                </span>
              </div>
            </div>
            <span className="text-xs font-bold text-success">+$8.30</span>
          </div>

          {/* Конверсия 3 */}
          <div className="flex items-center justify-between p-12 text-left">
            <div className="flex items-center gap-12">
              <div className="w-8 h-8 rounded-app-xs bg-accentDark/50 border border-accent/10 flex items-center justify-center text-accent text-xs font-bold">
                CR
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-white">Crypto Trading</span>
                <span className="text-[10px] text-textMuted flex items-center gap-1 mt-0.5">
                  <Clock size={10} />
                  1 час назад
                </span>
              </div>
            </div>
            <span className="text-xs font-bold text-success">+$15.20</span>
          </div>
        </Card>
      </div>

      {/* Секция: Новые офферы */}
      <div className="flex flex-col gap-12">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-white">Новые офферы</span>
          <button
            onClick={() => { triggerHaptic.lightImpact(); navigate('/offers'); }}
            className="text-xs text-accent hover:text-accent/80 flex items-center gap-1 transition-colors font-medium"
          >
            Все офферы
            <ArrowRight size={12} />
          </button>
        </div>

        <Card padding="none" className="divide-y divide-gray-800/40">
          {/* Новый оффер 1 */}
          <div className="flex items-center justify-between p-12 text-left">
            <div className="flex items-center gap-12">
              <div className="w-8 h-8 rounded-app-xs bg-accentDark/30 border border-gray-800/40 flex items-center justify-center text-textSec text-xs font-bold">
                MD
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-white">Mainstream Dating</span>
                <span className="text-[10px] text-textMuted mt-0.5">Выплата за регистрацию</span>
              </div>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-xs font-bold text-accent">$0.85</span>
              <span className="text-[8px] text-textMuted">EPC: $0.12</span>
            </div>
          </div>

          {/* Новый оффер 2 */}
          <div className="flex items-center justify-between p-12 text-left">
            <div className="flex items-center gap-12">
              <div className="w-8 h-8 rounded-app-xs bg-accentDark/30 border border-gray-800/40 flex items-center justify-center text-textSec text-xs font-bold">
                NU
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-white">Nutra Sweepstakes</span>
                <span className="text-[10px] text-textMuted mt-0.5">Выплата за CC-Submit</span>
              </div>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-xs font-bold text-accent">$0.75</span>
              <span className="text-[8px] text-textMuted">EPC: $0.09</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
