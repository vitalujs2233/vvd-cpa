import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X, Loader2 } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { useStarsWallet } from '@/shared/lib/StarsWalletContext';
import { createStarsInvoice, openStarsInvoice, type StarsPackage } from '@/shared/lib/stars';
import { triggerHaptic } from '@/shared/lib/telegram';

const amounts: StarsPackage[] = [50, 100, 250];

/** Only mounted under /tools; never import this component into Home. */
export const ToolsTopup: React.FC = () => {
  const { stars, paymentsEnabled, refresh, error: walletError } = useStarsWallet();
  const [visible, setVisible] = useState(false);
  const [amount, setAmount] = useState<StarsPackage>(50);
  const [busy, setBusy] = useState(false);
  const [waitingFor, setWaitingFor] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (waitingFor === null) return;
    let attempts = 0;
    let cancelled = false;
    const interval = window.setInterval(async () => {
      if (cancelled) return;
      attempts++;
      const current = await refresh();
      if (cancelled) return;
      if (current !== null && current >= waitingFor) {
        setWaitingFor(null);
        setNotice('Платёж подтверждён сервером Telegram, баланс обновлён.');
        triggerHaptic.success();
      } else if (attempts >= 60) {
        setWaitingFor(null);
        setNotice('Подтверждение ещё обрабатывается. Обновите баланс позже.');
      }
    }, 1000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [waitingFor, refresh]);

  const checkout = async () => {
    if (!paymentsEnabled || busy || waitingFor !== null) return;
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const before = await refresh();
      const invoice = await createStarsInvoice(amount);
      const status = await openStarsInvoice(invoice);
      if (status === 'cancelled') {
        setNotice('Оплата отменена.');
      } else if (status === 'failed') {
        setError('Не удалось провести оплату.');
      } else {
        // The client callback is not payment proof. The server credits
        // only on a verified successful_payment Telegram update.
        setNotice('Ожидаем подтверждение оплаты от Telegram…');
        setWaitingFor((before ?? 0) + amount);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Ошибка создания счёта.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => { setVisible(true); setError(''); setNotice(''); void refresh(); }}
        className="inline-flex items-center justify-center gap-2 rounded-app-xs bg-gold-gradient px-4 py-2.5 text-sm font-bold text-bgMain shadow-glow-gold active:scale-95"
      >
        <Plus size={17} /> Пополнить
      </button>
      {visible && createPortal(
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/80 px-4 py-8 backdrop-blur-md"
          onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setVisible(false); }}>
          <section role="dialog" aria-modal="true" aria-label="Пополнение баланса инструментов"
            className="glass-card flex max-h-[90dvh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-card p-5 text-textPrimary">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Пополнить инструменты</h2>
              <button type="button" aria-label="Закрыть" onClick={() => setVisible(false)}
                className="rounded-full border border-white/10 p-2 text-textSecondary"><X size={18} /></button>
            </div>
            <p className="text-xs leading-5 text-textSecondary">
              Баланс инструментов — отдельный счёт, не связанный с партнёрскими долларами.
              Для цифровых услуг внутри Telegram применяется Telegram Stars.
            </p>
            <div className="flex items-center justify-between rounded-app-xs border border-white/10 bg-white/[0.03] p-3">
              <span className="text-xs text-textSecondary">Доступно</span>
              <strong className="text-accentBrightGold">⭐ {stars ?? '—'}</strong>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {amounts.map((value) => (
                <button key={value} type="button" aria-pressed={amount === value}
                  disabled={busy || waitingFor !== null} onClick={() => setAmount(value)}
                  className={'rounded-app-xs border px-2 py-3 text-sm font-bold ' +
                    (amount === value ? 'border-accentGold bg-accentGold/15 text-accentBrightGold' :
                      'border-white/10 bg-white/[0.03] text-textPrimary')}>
                  ⭐ {value}
                </button>
              ))}
            </div>
            {!paymentsEnabled && (
              <p role="status" className="rounded-app-xs border border-accentGold/25 bg-accentGold/10 p-3 text-xs leading-5 text-accentLightGold">
                Приём оплаты отключён: реальные AI, номера и прокси ещё не подключены.
                Демонстрации бесплатны, деньги не списываются.
              </p>
            )}
            <Button type="button" disabled={!paymentsEnabled || busy || waitingFor !== null}
              onClick={() => void checkout()}>
              {busy || waitingFor !== null ? <><Loader2 size={16} className="mr-2 animate-spin" /> Проверяем платёж</> :
                <>Создать счёт · ⭐ {amount}</>}
            </Button>
            {notice && <p role="status" className="text-xs text-textSecondary">{notice}</p>}
            {(error || walletError) && <p role="alert" className="text-xs text-error">{error || walletError}</p>}
          </section>
        </div>, document.body)}
    </>
  );
};
