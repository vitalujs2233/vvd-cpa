import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  History,
  Wallet,
  ChevronRight,
  Coins,
  Clock3,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

import { Card } from '@/shared/ui/Card';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';
import { triggerHaptic } from '@/shared/lib/telegram';

const API_URL = 'https://vvd-cpa-v2.onrender.com';
const MIN_WITHDRAWAL = 50;

interface WithdrawalItem {
  id: number;
  amount: number;
  payment_method: string;
  wallet: string;
  status: 'pending' | 'paid' | 'rejected';
  created_at: string;
  processed_at: string | null;
}

export const Withdrawal: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeSubView, setActiveSubView] = useState<
    'withdraw' | 'history'
  >('withdraw');

  const [amount, setAmount] = useState('');
  const [wallet, setWallet] = useState('');

  const [available, setAvailable] = useState(0);
  const [partnerCode, setPartnerCode] = useState('');
  const [withdrawals, setWithdrawals] = useState<WithdrawalItem[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formErrors, setFormErrors] = useState<{
    amount?: string;
    wallet?: string;
  }>({});

  const telegramId =
    window.Telegram?.WebApp?.initDataUnsafe?.user?.id;

  useEffect(() => {
    const tab = searchParams.get('tab');

    if (tab === 'history') {
      setActiveSubView('history');
    } else {
      setActiveSubView('withdraw');
    }
  }, [searchParams]);

  const loadData = async () => {
    if (!telegramId) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);

      const [balanceResponse, partnerResponse] =
        await Promise.all([
          fetch(`${API_URL}/balance/${telegramId}`),
          fetch(`${API_URL}/smartlink/${telegramId}/adult`),
        ]);

      const balanceData = await balanceResponse.json();
      const partnerData = await partnerResponse.json();

      setAvailable(Number(balanceData.available || 0));

      const resolvedPartnerCode = String(
        partnerData.partner_code || ''
      ).trim();

      if (!resolvedPartnerCode) {
        throw new Error('Не удалось определить партнерский код');
      }

      setPartnerCode(resolvedPartnerCode);

      const withdrawalsResponse = await fetch(
        `${API_URL}/withdrawals/${encodeURIComponent(resolvedPartnerCode)}`
      );

      const withdrawalsData = await withdrawalsResponse.json();

      setWithdrawals(
        Array.isArray(withdrawalsData.withdrawals)
          ? withdrawalsData.withdrawals
          : []
      );
    } catch (error) {
      console.error('Withdrawal load error:', error);
      triggerHaptic.error();
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [telegramId]);

  const handleBackToMain = () => {
    triggerHaptic.lightImpact();

    if (activeSubView === 'history') {
      handleSubViewChange('withdraw');
      return;
    }

    navigate('/');
  };

  const handleSubViewChange = (
    view: 'withdraw' | 'history'
  ) => {
    triggerHaptic.lightImpact();

    setActiveSubView(view);

    setSearchParams(
      view === 'history'
        ? { tab: 'history' }
        : {}
    );

    if (view === 'history') {
      loadData();
    }
  };

  const handleWithdrawSubmit = async () => {
    const errors: {
      amount?: string;
      wallet?: string;
    } = {};

    const parsedAmount = Number(amount);

    if (!partnerCode) {
      errors.amount = 'Не удалось определить партнерский код';
    } else if (
      !Number.isFinite(parsedAmount) ||
      parsedAmount < MIN_WITHDRAWAL
    ) {
      errors.amount = `Минимальная сумма вывода $${MIN_WITHDRAWAL}`;
    } else if (parsedAmount > available) {
      errors.amount =
        `Недостаточно средств. Доступно $${available.toFixed(2)}`;
    }

    if (
      !wallet.startsWith('T') ||
      wallet.length < 30
    ) {
      errors.wallet =
        'Укажите корректный адрес USDT TRC20';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      triggerHaptic.error();
      return;
    }

    try {
      setFormErrors({});
      setIsSubmitting(true);
      triggerHaptic.mediumImpact();

      const response = await fetch(
        `${API_URL}/withdrawals`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            partner_code: partnerCode,
            amount: parsedAmount,
            payment_method: 'USDT TRC20',
            wallet: wallet.trim(),
          }),
        }
      );

      const data = await response.json();

      if (!data.success) {
        throw new Error(
          data.message || 'Ошибка создания заявки'
        );
      }

      triggerHaptic.success();

      setAmount('');

      await loadData();

      setActiveSubView('history');
      setSearchParams({ tab: 'history' });
    } catch (error) {
      console.error('Withdrawal submit error:', error);

      triggerHaptic.error();

      setFormErrors({
        amount:
          error instanceof Error
            ? error.message
            : 'Ошибка создания заявки',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (date: string) => {
    if (!date) return '—';

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
      return date;
    }

    return parsedDate.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatus = (status: WithdrawalItem['status']) => {
    if (status === 'paid') {
      return {
        label: 'Выплачено',
        className: 'text-success',
        icon: <CheckCircle2 size={16} />,
      };
    }

    if (status === 'rejected') {
      return {
        label: 'Отклонено',
        className: 'text-error',
        icon: <XCircle size={16} />,
      };
    }

    return {
      label: 'Ожидает выплаты',
      className: 'text-accentPurple',
      icon: <Clock3 size={16} />,
    };
  };

  return (
    <div className="flex flex-col gap-4 p-4 select-none pb-[45vh] min-h-screen overflow-y-auto overscroll-contain touch-pan-y animate-fade-in">

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-left">

          <button
            onClick={handleBackToMain}
            className="w-11 h-11 rounded-full bg-bgCard/40 border border-white/10 flex items-center justify-center text-textSecondary active:scale-95 transition-transform"
          >
            <ArrowLeft size={18} />
          </button>

          <div className="flex flex-col">
            <span className="text-[10px] text-accentPurple font-bold uppercase tracking-wider">
              Финансы
            </span>

            <h1 className="text-xl font-bold text-white leading-none mt-0.5">
              Выплаты
            </h1>
          </div>
        </div>

        <div className="flex bg-bgCard/35 border border-white/[0.04] rounded-app-xs p-2 gap-2 h-11 items-center">

          <button
            onClick={() => handleSubViewChange('withdraw')}
            className={`p-2 rounded-app-xs ${
              activeSubView === 'withdraw'
                ? 'bg-accent-gradient text-white'
                : 'text-textSecondary'
            }`}
          >
            <Wallet size={16} />
          </button>

          <button
            onClick={() => handleSubViewChange('history')}
            className={`p-2 rounded-app-xs ${
              activeSubView === 'history'
                ? 'bg-accent-gradient text-white'
                : 'text-textSecondary'
            }`}
          >
            <History size={16} />
          </button>

        </div>
      </div>

      {activeSubView === 'withdraw' && (
        <div className="flex flex-col gap-4 animate-fade-in">

          <Card
            padding="md"
            className="text-left flex flex-col gap-3 border-white/5 bg-white/[0.01]"
          >
            <div className="flex justify-between items-center text-xs">

              <span className="text-textSecondary font-semibold uppercase tracking-wider">
                Доступно к выводу
              </span>

              <span className="font-bold text-success">
                {isLoading
                  ? '...'
                  : `$${available.toFixed(2)}`}
              </span>

            </div>

            <div className="h-[1px] bg-gray-800/40 w-full" />

            <div className="flex justify-between items-center text-xs">

              <span className="text-textSecondary font-semibold">
                Минимальная сумма
              </span>

              <span className="font-bold text-white">
                ${MIN_WITHDRAWAL.toFixed(2)}
              </span>

            </div>
          </Card>

          <div className="text-left flex flex-col gap-2">

            <span className="text-xs font-bold text-white px-2">
              Платежный шлюз
            </span>

            <Card
              padding="md"
              className="flex items-center justify-between border-success/20 bg-success/[0.02]"
            >

              <div className="flex items-center gap-3">

                <div className="w-10 h-10 rounded-app-xs bg-success/10 border border-success/20 flex items-center justify-center text-success">
                  <Coins size={18} />
                </div>

                <div className="flex flex-col">

                  <span className="text-xs font-bold text-white">
                    USDT TRC20
                  </span>

                  <span className="text-[9px] text-textSecondary font-semibold mt-0.5">
                    Криптовалютный протокол TRON
                  </span>

                </div>
              </div>

              <span className="text-[9px] text-success font-bold uppercase tracking-widest px-2 py-0.5 bg-success/10 border border-success/20 rounded-app-xs">
                Сеть активна
              </span>

            </Card>
          </div>

          <div className="flex flex-col gap-3">

            <Input
              label="Сумма вывода ($)"
              placeholder="50.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onFocus={(e) => {
                window.setTimeout(() => {
                  e.currentTarget.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                  });
                }, 300);
              }}
              error={formErrors.amount}
              type="number"
            />

            <Input
              label="Адрес кошелька (USDT TRC20)"
              placeholder="Введите T-адрес кошелька"
              value={wallet}
              onChange={(e) => setWallet(e.target.value)}
              onFocus={(e) => {
                window.setTimeout(() => {
                  e.currentTarget.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                  });
                }, 300);
              }}
              error={formErrors.wallet}
            />

          </div>

          <Card
            padding="md"
            className="flex flex-col gap-2 text-left bg-white/[0.01] border-white/5"
          >

            <div className="flex justify-between items-center text-xs">

              <span className="text-textSecondary">
                Сумма заявки
              </span>

              <span className="font-bold text-white">
                {amount || '0.00'} USDT
              </span>

            </div>

            <div className="flex justify-between items-center text-xs">

              <span className="text-textSecondary">
                Системная комиссия
              </span>

              <span className="font-bold text-success">
                0 USDT
              </span>

            </div>

          </Card>

          <Button
            variant="success"
            size="lg"
            isLoading={isSubmitting}
            onClick={handleWithdrawSubmit}
          >
            Подать заявку на выплату
          </Button>

          <span className="text-[10px] text-textSecondary/60 leading-relaxed text-center">
            Заявки на выплату обрабатываются один раз в неделю.
            После подачи заявки сумма резервируется с доступного баланса.
          </span>

        </div>
      )}

      {activeSubView === 'history' && (
        <div className="flex flex-col gap-3 animate-fade-in">

          {isLoading && (
            <div className="text-xs text-textSecondary text-center py-10">
              Загрузка выплат...
            </div>
          )}

          {!isLoading && withdrawals.length === 0 && (
            <div className="text-xs text-textSecondary text-center py-10">
              История выплат пока пуста
            </div>
          )}

          {!isLoading &&
            withdrawals.map((tx) => {
              const status = getStatus(tx.status);

              return (
                <Card
                  key={tx.id}
                  padding="sm"
                  className="flex items-center justify-between text-left"
                >

                  <div className="flex items-center gap-3">

                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center border border-white/10 ${status.className}`}
                    >
                      {status.icon}
                    </div>

                    <div className="flex flex-col">

                      <span className="text-xs font-bold text-white">
                        {tx.payment_method}
                      </span>

                      <span className="text-[9px] text-textSecondary mt-1">
                        {formatDate(tx.created_at)}
                      </span>

                      <span className="text-[8px] text-textSecondary mt-0.5 truncate max-w-[180px]">
                        {tx.wallet}
                      </span>

                    </div>

                  </div>

                  <div className="flex items-center gap-3">

                    <div className="flex flex-col items-end">

                      <span className="text-xs font-bold text-white">
                        ${tx.amount.toFixed(2)}
                      </span>

                      <span
                        className={`text-[8px] font-bold uppercase tracking-wider mt-0.5 ${status.className}`}
                      >
                        {status.label}
                      </span>

                    </div>

                    <ChevronRight
                      size={16}
                      className="text-gray-600"
                    />

                  </div>

                </Card>
              );
            })}

        </div>
      )}

    </div>
  );
};
