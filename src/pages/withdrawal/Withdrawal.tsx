import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  ArrowLeft, History, Wallet, CheckCircle2, XCircle, 
  ChevronRight, ArrowUpRight, HelpCircle, Coins 
} from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';
import { triggerHaptic } from '@/shared/lib/telegram';

interface Transaction {
  id: string;
  amount: number;
  method: string;
  address: string;
  txId: string;
  date: string;
  status: 'completed' | 'declined';
}

const TRANSACTIONS_MOCK: Transaction[] = [
  {
    id: 'tx-1',
    amount: 100.00,
    method: 'USDT TRC20',
    address: 'TQD...e8F2Jz9nttz2W11m',
    txId: '0x123f99...5e78',
    date: '25.05.2024 12:30',
    status: 'completed',
  },
  {
    id: 'tx-2',
    amount: 200.00,
    method: 'USDT TRC20',
    address: 'TQD...e8F2Jz9nttz2W11m',
    txId: '0x456da2...8b99',
    date: '18.05.2024 18:10',
    status: 'completed',
  },
  {
    id: 'tx-3',
    amount: 150.00,
    method: 'USDT TRC20',
    address: 'TQD...e8F2Jz9nttz2W11m',
    txId: '0x789cb4...1a23',
    date: '10.05.2024 15:45',
    status: 'completed',
  },
  {
    id: 'tx-4',
    amount: 50.00,
    method: 'USDT TRC20',
    address: 'TQD...e8F2Jz9nttz2W11m',
    txId: '—',
    date: '03.05.2024 09:15',
    status: 'declined',
  },
];

export const Withdrawal: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Управление вкладками: 'withdraw' (Форма вывода), 'history' (История), 'receipt' (Детали)
  const [activeSubView, setActiveSubView] = useState<'withdraw' | 'history' | 'receipt'>('withdraw');
  
  // Состояния формы вывода
  const [amount, setAmount] = useState('100.00');
  const [wallet, setWallet] = useState('TQD9wtZe8F2Jz9nttz2W11m78abc901234');
  const [formErrors, setFormErrors] = useState<{ amount?: string; wallet?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Выбранная транзакция для отображения квитанции чека
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  // Считываем вкладку из URL query params (например, ?tab=history с главной страницы)
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'history') {
      setActiveSubView('history');
    } else {
      setActiveSubView('withdraw');
    }
  }, [searchParams]);

  const handleBackToMain = () => {
    triggerHaptic.lightImpact();
    navigate('/');
  };

  const handleSubViewChange = (view: 'withdraw' | 'history') => {
    triggerHaptic.lightImpact();
    setActiveSubView(view);
    setSearchParams(view === 'history' ? { tab: 'history' } : {});
  };

  // Валидация и отправка формы
  const handleWithdrawSubmit = () => {
    const errors: { amount?: string; wallet?: string } = {};
    const parsedAmount = parseFloat(amount);

    if (isNaN(parsedAmount) || parsedAmount < 10) {
      errors.amount = 'Минимальная сумма вывода составляет $10';
    } else if (parsedAmount > 154.50) {
      errors.amount = 'Недостаточно средств. Максимальный баланс: $154.50';
    }

    // Базовая проверка криптокошелька TRC20
    if (!wallet.startsWith('T') || wallet.length < 30) {
      errors.wallet = 'Укажите корректный адрес USDT TRC20 (начинается с T)';
    }

    if (Object.keys(errors).length > 0) {
      triggerHaptic.error();
      setFormErrors(errors);
      return;
    }

    setFormErrors({});
    setIsSubmitting(true);
    triggerHaptic.mediumImpact();

    // Имитация задержки отправки транзакции
    setTimeout(() => {
      setIsSubmitting(false);
      triggerHaptic.success();
      
      // Формируем новую транзакцию на лету и открываем её детали (Чек)
      const newTx: Transaction = {
        id: `tx-new-${Date.now()}`,
        amount: parsedAmount,
        method: 'USDT TRC20',
        address: wallet,
        txId: '0x' + Math.random().toString(16).slice(2, 10) + '...' + Math.random().toString(16).slice(2, 6),
        date: new Date().toLocaleString('ru-RU', { hour12: false }).replace(',', ''),
        status: 'completed',
      };
      
      setSelectedTx(newTx);
      setActiveSubView('receipt');
    }, 1500);
  };

  const handleSelectTransaction = (tx: Transaction) => {
    triggerHaptic.lightImpact();
    setSelectedTx(tx);
    setActiveSubView('receipt');
  };

  const handleCloseReceipt = () => {
    triggerHaptic.lightImpact();
    setSelectedTx(null);
    setActiveSubView('history'); // Возвращаемся в историю после закрытия чека
  };

  return (
    <div className="flex flex-col gap-16 p-16 select-none pb-32">
      
      {/* Шапка с кнопкой назад на Главную */}
      {activeSubView !== 'receipt' ? (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-12 text-left">
            <button 
              onClick={handleBackToMain}
              className="w-10 h-10 rounded-app-xs bg-bgCard border border-gray-800/40 flex items-center justify-center text-textSec active:scale-95 transition-transform"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="flex flex-col">
              <span className="text-[10px] text-accent font-semibold uppercase tracking-wider">Финансы</span>
              <h1 className="text-xl font-bold text-white leading-none">Вывод средств</h1>
            </div>
          </div>

          {/* Табы переключения Форма / История */}
          <div className="flex bg-bgCard border border-gray-800/40 rounded-app-xs p-2 gap-2 h-10 items-center">
            <button 
              onClick={() => handleSubViewChange('withdraw')}
              className={`p-2 rounded-app-xs transition-colors ${activeSubView === 'withdraw' ? 'bg-accent text-white' : 'text-textMuted'}`}
            >
              <Wallet size={16} />
            </button>
            <button 
              onClick={() => handleSubViewChange('history')}
              className={`p-2 rounded-app-xs transition-colors ${activeSubView === 'history' ? 'bg-accent text-white' : 'text-textMuted'}`}
            >
              <History size={16} />
            </button>
          </div>
        </div>
      ) : (
        /* Шапка для Экрана Чека (Квитанции) */
        <div className="flex items-center gap-12 text-left">
          <button 
            onClick={handleCloseReceipt}
            className="w-10 h-10 rounded-app-xs bg-bgCard border border-gray-800/40 flex items-center justify-center text-textSec active:scale-95 transition-transform"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex flex-col">
            <span className="text-[10px] text-accent font-semibold uppercase tracking-wider">Квитанция</span>
            <h1 className="text-xl font-bold text-white leading-none">Детали выплаты</h1>
          </div>
        </div>
      )}

      {/* ================= VIEW 1: ФОРМА ВЫВОДА ================= */}
      {activeSubView === 'withdraw' && (
        <div className="flex flex-col gap-16">
          <Card padding="md" className="text-left flex flex-col gap-12">
            <div className="flex justify-between items-center">
              <span className="text-xs text-textMuted font-medium uppercase">Доступно к выводу</span>
              <span className="text-xs font-bold text-success">$154.50</span>
            </div>
            <div className="h-[1px] bg-gray-800/40 w-full" />
            <div className="flex justify-between items-center">
              <span className="text-xs text-textMuted font-medium">Минимальный вывод</span>
              <span className="text-xs font-bold text-white">$10.00</span>
            </div>
          </Card>

          {/* Выбор Платежной системы */}
          <div className="text-left flex flex-col gap-8">
            <span className="text-xs font-bold text-white px-1">Способ вывода</span>
            <Card padding="md" className="flex items-center justify-between border-accent/20 bg-accentDark/[0.05]">
              <div className="flex items-center gap-12">
                <div className="w-8 h-8 rounded-app-xs bg-success/10 border border-success/20 flex items-center justify-center text-success">
                  <Coins size={16} />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white">USDT TRC20</span>
                  <span className="text-[9px] text-textMuted">Перевод на криптокошелек</span>
                </div>
              </div>
              <span className="text-[10px] text-accent font-semibold uppercase tracking-wider px-2 py-1 bg-accent/10 border border-accent/20 rounded-app-xs">Сеть TRON</span>
            </Card>
          </div>

          {/* Инпуты Суммы и Кошелька */}
          <div className="flex flex-col gap-12">
            <Input 
              label="Сумма вывода ($)"
              placeholder="100.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              error={formErrors.amount}
              type="number"
            />

            <Input 
              label="Адрес кошелька (USDT TRC20)"
              placeholder="Введите T-адрес кошелька"
              value={wallet}
              onChange={(e) => setWallet(e.target.value)}
              error={formErrors.wallet}
            />
          </div>

          {/* Итоги вывода */}
          <Card padding="md" className="flex flex-col gap-8 text-left bg-gray-900/10 border-gray-800/20">
            <div className="flex justify-between items-center text-xs">
              <span className="text-textMuted">Вы получите</span>
              <span className="font-bold text-white">{amount || '0.00'} USDT</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-textMuted">Комиссия сети</span>
              <span className="font-bold text-success">0 USDT (Бесплатно)</span>
            </div>
          </Card>

          <Button 
            variant="primary" 
            size="lg" 
            className="h-12"
            isLoading={isSubmitting}
            onClick={handleWithdrawSubmit}
          >
            Вывести средства
          </Button>
          
          <span className="text-[10px] text-textMuted leading-tight text-center">
            Обработка выплаты занимает до 24 часов. Без скрытых комиссий.
          </span>
        </div>
      )}

      {/* ================= VIEW 2: ИСТОРИЯ ВЫПЛАТ ================= */}
      {activeSubView === 'history' && (
        <div className="flex flex-col gap-12">
          {TRANSACTIONS_MOCK.map((tx) => (
            <Card 
              key={tx.id} 
              clickable 
              padding="sm"
              onClick={() => handleSelectTransaction(tx)}
              className="flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-12">
                <div className={`w-8 h-8 rounded-app-xs flex items-center justify-center border ${
                  tx.status === 'completed' 
                    ? 'text-success bg-success/10 border-success/20' 
                    : 'text-error bg-error/10 border-error/20'
                }`}>
                  <ArrowUpRight size={16} />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white">{tx.method}</span>
                  <span className="text-[10px] text-textMuted mt-0.5">{tx.date}</span>
                </div>
              </div>

              <div className="flex items-center gap-12">
                <div className="flex flex-col items-end">
                  <span className={`text-xs font-bold ${tx.status === 'completed' ? 'text-success' : 'text-error'}`}>
                    {tx.status === 'completed' ? '+' : '-'}${tx.amount.toFixed(2)}
                  </span>
                  <span className="text-[8px] text-textMuted uppercase font-semibold">
                    {tx.status === 'completed' ? 'Завершено' : 'Отклонено'}
                  </span>
                </div>
                <ChevronRight size={16} className="text-gray-600" />
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ================= VIEW 3: ДЕТАЛИ ВЫПЛАТЫ (ЧЕК) ================= */}
      {activeSubView === 'receipt' && selectedTx && (
        <div className="flex flex-col gap-16 animate-fade-in">
          
          {/* Статус чека */}
          <Card padding="lg" className="flex flex-col items-center justify-center text-center gap-12 border-success/15 bg-success/[0.01]">
            {selectedTx.status === 'completed' ? (
              <>
                <div className="w-16 h-16 rounded-full bg-success/10 border border-success/30 flex items-center justify-center text-success animate-bounce">
                  <CheckCircle2 size={36} />
                </div>
                <div className="flex flex-col">
                  <h2 className="text-lg font-bold text-white">Выплата отправлена</h2>
                  <p className="text-xs text-textMuted mt-1">Транзакция успешно подтверждена сетью Tron.</p>
                </div>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full bg-error/10 border border-error/30 flex items-center justify-center text-error animate-pulse">
                  <XCircle size={36} />
                </div>
                <div className="flex flex-col">
                  <h2 className="text-lg font-bold text-white">Выплата отклонена</h2>
                  <p className="text-xs text-textMuted mt-1">Пожалуйста, свяжитесь с поддержкой для уточнения причин.</p>
                </div>
              </>
            )}
          </Card>

          {/* Параметры транзакции */}
          <Card padding="md" className="flex flex-col gap-12 text-left">
            <div className="flex justify-between items-center text-xs">
              <span className="text-textMuted">Сумма</span>
              <span className="font-bold text-white">{selectedTx.amount.toFixed(2)} USDT</span>
            </div>
            <div className="h-[1px] bg-gray-800/40 w-full" />

            <div className="flex justify-between items-center text-xs">
              <span className="text-textMuted">Метод перевода</span>
              <span className="font-bold text-white">{selectedTx.method}</span>
            </div>
            <div className="h-[1px] bg-gray-800/40 w-full" />

            <div className="flex justify-between items-center text-xs">
              <span className="text-textMuted">Адрес кошелька</span>
              <span className="font-mono text-[10px] text-white select-text truncate max-w-[180px]">
                {selectedTx.address}
              </span>
            </div>
            <div className="h-[1px] bg-gray-800/40 w-full" />

            <div className="flex justify-between items-center text-xs">
              <span className="text-textMuted">TxID хеш</span>
              <span className="font-mono text-[10px] text-accent select-text truncate max-w-[180px]">
                {selectedTx.txId}
              </span>
            </div>
            <div className="h-[1px] bg-gray-800/40 w-full" />

            <div className="flex justify-between items-center text-xs">
              <span className="text-textMuted">Дата отправки</span>
              <span className="font-bold text-white">{selectedTx.date}</span>
            </div>
          </Card>

          {/* Кнопки возврата и поддержки */}
          <div className="flex flex-col gap-8">
            <Button 
              variant="secondary" 
              size="lg" 
              className="h-12 border border-gray-800 bg-transparent"
              onClick={() => { triggerHaptic.lightImpact(); navigate('/chat'); }}
            >
              <HelpCircle size={16} className="mr-2 text-textMuted" />
              Поддержка
            </Button>
            
            <Button 
              variant="outline" 
              size="md" 
              onClick={handleCloseReceipt}
              className="h-10 text-xs text-textMuted"
            >
              Вернуться назад
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
