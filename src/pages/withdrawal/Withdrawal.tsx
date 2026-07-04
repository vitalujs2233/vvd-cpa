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
    address: 'TQDwtZe8F2Jz9nttz2W11m78abc901234',
    txId: '0x123f99f1a23e5e78',
    date: '25.05.2024 12:30',
    status: 'completed',
  },
  {
    id: 'tx-2',
    amount: 200.00,
    method: 'USDT TRC20',
    address: 'TQDwtZe8F2Jz9nttz2W11m78abc901234',
    txId: '0x456da2b41a238b99',
    date: '18.05.2024 18:10',
    status: 'completed',
  },
  {
    id: 'tx-3',
    amount: 150.00,
    method: 'USDT TRC20',
    address: 'TQDwtZe8F2Jz9nttz2W11m78abc901234',
    txId: '0x789cb4f1a23e1a23',
    date: '10.05.2024 15:45',
    status: 'completed',
  },
  {
    id: 'tx-4',
    amount: 50.00,
    method: 'USDT TRC20',
    address: 'TQDwtZe8F2Jz9nttz2W11m78abc901234',
    txId: '—',
    date: '03.05.2024 09:15',
    status: 'declined',
  },
];

export const Withdrawal: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [activeSubView, setActiveSubView] = useState<'withdraw' | 'history' | 'receipt'>('withdraw');
  
  const [amount, setAmount] = useState('100.00');
  const [wallet, setWallet] = useState('TQD9wtZe8F2Jz9nttz2W11m78abc901234');
  const [formErrors, setFormErrors] = useState<{ amount?: string; wallet?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

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

  const handleWithdrawSubmit = () => {
    const errors: { amount?: string; wallet?: string } = {};
    const parsedAmount = parseFloat(amount);

    if (isNaN(parsedAmount) || parsedAmount < 10) {
      errors.amount = 'Минимальная сумма вывода составляет $10';
    } else if (parsedAmount > 154.50) {
      errors.amount = 'Недостаточно средств. Максимальный баланс: $154.50';
    }

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

    setTimeout(() => {
      setIsSubmitting(false);
      triggerHaptic.success();
      
      const newTx: Transaction = {
        id: `tx-new-${Date.now()}`,
        amount: parsedAmount,
        method: 'USDT TRC20',
        address: wallet,
        txId: '0x' + Math.random().toString(16).slice(2, 10) + 'f1a23e' + Math.random().toString(16).slice(2, 6),
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
    setActiveSubView('history');
  };

  return (
    <div className="flex flex-col gap-20 p-16 select-none pb-32 animate-fade-in">
      
      {/* Шапка раздела с переключателями */}
      {activeSubView !== 'receipt' ? (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-12 text-left">
            <button 
              onClick={handleBackToMain}
              className="w-11 h-11 rounded-full bg-bgCard/40 border border-white/10 flex items-center justify-center text-textSecondary hover:text-textPrimary active:scale-95 transition-transform shadow-glass-inner"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="flex flex-col">
              <span className="text-[10px] text-accentPurple font-bold uppercase tracking-wider">Финансы</span>
              <h1 className="text-xl font-bold text-white leading-none mt-0.5">Выплаты</h1>
            </div>
          </div>

          {/* Табы переключения (Стекло, Blur, компактные размеры) */}
          <div className="flex bg-bgCard/35 backdrop-blur-md border border-white/[0.04] rounded-app-xs p-4 gap-4 h-11 items-center shadow-glass-inner">
            <button 
              onClick={() => handleSubViewChange('withdraw')}
              className={`p-2.5 rounded-app-xs transition-all duration-200 ${
                activeSubView === 'withdraw' 
                  ? 'bg-accent-gradient text-white shadow-glow-purple/40 scale-105' 
                  : 'text-textSecondary hover:text-textPrimary'
              }`}
            >
              <Wallet size={16} />
            </button>
            <button 
              onClick={() => handleSubViewChange('history')}
              className={`p-2.5 rounded-app-xs transition-all duration-200 ${
                activeSubView === 'history' 
                  ? 'bg-accent-gradient text-white shadow-glow-purple/40 scale-105' 
                  : 'text-textSecondary hover:text-textPrimary'
              }`}
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
            className="w-11 h-11 rounded-full bg-bgCard/40 border border-white/10 flex items-center justify-center text-textSecondary hover:text-textPrimary active:scale-95 transition-transform shadow-glass-inner"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex flex-col">
            <span className="text-[10px] text-accentPurple font-bold uppercase tracking-wider">Квитанция</span>
            <h1 className="text-xl font-bold text-white leading-none mt-0.5">Детали выплаты</h1>
          </div>
        </div>
      )}

      {/* ================= VIEW 1: ФОРМА ВЫВОДА (Раздел 6) ================= */}
      {activeSubView === 'withdraw' && (
        <div className="flex flex-col gap-20 animate-fade-in">
          {/* Сводка балансов */}
          <Card padding="md" className="text-left flex flex-col gap-12 border-white/5 shadow-glass-inner bg-white/[0.01]">
            <div className="flex justify-between items-center text-xs">
              <span className="text-textSecondary font-semibold uppercase tracking-wider">Доступно к выводу</span>
              <span className="font-bold text-success">$154.50</span>
            </div>
            <div className="h-[1px] bg-gray-800/40 w-full" />
            <div className="flex justify-between items-center text-xs">
              <span className="text-textSecondary font-semibold">Минимальная сумма</span>
              <span className="font-bold text-white">$10.00</span>
            </div>
          </Card>

          {/* Платежный шлюз по гайдлайну (Banking Card UI) */}
          <div className="text-left flex flex-col gap-8">
            <span className="text-xs font-bold text-white px-2">Платежный шлюз</span>
            <Card padding="md" className="flex items-center justify-between border-success/20 bg-success/[0.02] shadow-[0_0_15px_rgba(34,197,94,0.05)]">
              <div className="flex items-center gap-12">
                <div className="w-10 h-10 rounded-app-xs bg-success/10 border border-success/20 flex items-center justify-center text-success">
                  <Coins size={18} />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white">USDT TRC20</span>
                  <span className="text-[9px] text-textSecondary font-semibold mt-0.5">Криптовалютный протокол TRON</span>
                </div>
              </div>
              <span className="text-[9px] text-success font-bold uppercase tracking-widest px-2.5 py-1 bg-success/10 border border-success/20 rounded-app-xs">Сеть активна</span>
            </Card>
          </div>

          {/* Поля ввода (высота 48px, скругление 12px) */}
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

          {/* Прозрачный расчет комиссии */}
          <Card padding="md" className="flex flex-col gap-8 text-left bg-white/[0.01] border-white/5 shadow-glass-inner">
            <div className="flex justify-between items-center text-xs">
              <span className="text-textSecondary">Итого к зачислению</span>
              <span className="font-bold text-white">{amount || '0.00'} USDT</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-textSecondary">Системная комиссия</span>
              <span className="font-bold text-success">0 USDT (Бесплатно)</span>
            </div>
          </Card>

          {/* Большая успешная кнопка (54px, 18px скругление, зеленый Glow) */}
          <Button 
            variant="success" 
            size="lg" 
            isLoading={isSubmitting}
            onClick={handleWithdrawSubmit}
          >
            Подтвердить перевод
          </Button>
          
          <span className="text-[10px] text-textSecondary/60 leading-relaxed text-center">
            Обработка транзакции занимает до 24 часов. Средства отправляются нативно по блокчейн-сети.
          </span>
        </div>
      )}

      {/* ================= VIEW 2: ИСТОРИЯ ВЫПЛАТ (Раздел 6.1) ================= */}
      {activeSubView === 'history' && (
        <div className="flex flex-col gap-12 animate-fade-in">
          {TRANSACTIONS_MOCK.map((tx) => (
            <Card 
              key={tx.id} 
              clickable 
              padding="sm"
              onClick={() => handleSelectTransaction(tx)}
              className="flex items-center justify-between text-left hover-lift"
            >
              <div className="flex items-center gap-12">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center border ${
                  tx.status === 'completed' 
                    ? 'text-success bg-success/10 border-success/20 shadow-[0_0_10px_rgba(34,197,94,0.1)]' 
                    : 'text-error bg-error/10 border-error/20 shadow-[0_0_10px_rgba(239,68,68,0.1)]'
                }`}>
                  <ArrowUpRight size={16} />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white">{tx.method}</span>
                  <span className="text-[9px] text-textSecondary mt-1">{tx.date}</span>
                </div>
              </div>

              <div className="flex items-center gap-12">
                <div className="flex flex-col items-end">
                  <span className={`text-xs font-bold ${tx.status === 'completed' ? 'text-success' : 'text-error'}`}>
                    {tx.status === 'completed' ? '+' : '-'}${tx.amount.toFixed(2)}
                  </span>
                  <span className={`text-[8px] font-bold uppercase tracking-wider mt-0.5 ${
                    tx.status === 'completed' ? 'text-success/80' : 'text-error/80'
                  }`}>
                    {tx.status === 'completed' ? 'Завершено' : 'Отклонено'}
                  </span>
                </div>
                <ChevronRight size={16} className="text-gray-600" />
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ================= VIEW 3: ДЕТАЛИ ВЫПЛАТЫ (ЧЕК, Раздел 6.2) ================= */}
      {activeSubView === 'receipt' && selectedTx && (
        <div className="flex flex-col gap-20 animate-fade-in">
          
          {/* Статус чека с сияющей неоновой галочкой */}
          <Card padding="lg" className="flex flex-col items-center justify-center text-center gap-12 border-success/15 bg-success/[0.01] relative overflow-hidden">
            <div className="absolute inset-0 bg-success/5 blur-3xl rounded-full pointer-events-none" />
            
            {selectedTx.status === 'completed' ? (
              <>
                <div className="w-16 h-16 rounded-full bg-success/10 border border-success/30 flex items-center justify-center text-success drop-shadow-[0_0_12px_#22C55E] animate-neon-pulse">
                  <CheckCircle2 size={32} />
                </div>
                <div className="flex flex-col z-10">
                  <h2 className="text-lg font-bold text-white">Выплата отправлена</h2>
                  <p className="text-xs text-textSecondary mt-1">Транзакция успешно подтверждена и обработана шлюзом.</p>
                </div>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full bg-error/10 border border-error/30 flex items-center justify-center text-error drop-shadow-[0_0_12px_#EF4444] animate-pulse">
                  <XCircle size={32} />
                </div>
                <div className="flex flex-col z-10">
                  <h2 className="text-lg font-bold text-white">Выплата отклонена</h2>
                  <p className="text-xs text-textSecondary mt-1">Пожалуйста, свяжитесь с поддержкой платформы.</p>
                </div>
              </>
            )}
          </Card>

          {/* Параметры квитанции */}
          <Card padding="md" variant="default" className="flex flex-col gap-12 text-left shadow-premium">
            <div className="flex justify-between items-center text-xs">
              <span className="text-textSecondary">Сумма транзакции</span>
              <span className="font-bold text-white">{selectedTx.amount.toFixed(2)} USDT</span>
            </div>
            <div className="h-[1px] bg-white/[0.04] w-full" />

            <div className="flex justify-between items-center text-xs">
              <span className="text-textSecondary">Метод перевода</span>
              <span className="font-bold text-white">{selectedTx.method}</span>
            </div>
            <div className="h-[1px] bg-white/[0.04] w-full" />

            <div className="flex justify-between items-center text-xs">
              <span className="text-textSecondary">Адрес кошелька</span>
              <span className="font-mono text-[10px] text-textPrimary select-text truncate max-w-[180px]">
                {selectedTx.address}
              </span>
            </div>
            <div className="h-[1px] bg-white/[0.04] w-full" />

            <div className="flex justify-between items-center text-xs">
              <span className="text-textSecondary">TxID хеш блокчейна</span>
              <span className="font-mono text-[10px] text-accentPurple select-text truncate max-w-[180px] drop-shadow-[0_0_2px_rgba(124,58,237,0.3)]">
                {selectedTx.txId}
              </span>
            </div>
            <div className="h-[1px] bg-white/[0.04] w-full" />

            <div className="flex justify-between items-center text-xs">
              <span className="text-textSecondary">Дата создания</span>
              <span className="font-bold text-white">{selectedTx.date}</span>
            </div>
          </Card>

          {/* Кнопки возврата и поддержки */}
          <div className="flex flex-col gap-8">
            <Button 
              variant="secondary" 
              size="lg" 
              onClick={() => { triggerHaptic.lightImpact(); navigate('/chat'); }}
            >
              <HelpCircle size={16} className="mr-8 text-textSecondary" />
              Поддержка транзакции
            </Button>
            
            <Button 
              variant="outline" 
              size="md" 
              onClick={handleCloseReceipt}
              className="text-xs text-textSecondary"
            >
              Вернуться назад
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
