import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { createStarsInvoice, getStarsBalance, openStarsInvoice, StarsPackage } from '@/shared/lib/stars';
import { triggerHaptic } from '@/shared/lib/telegram';

const PACKAGES: StarsPackage[] = [50, 100, 250];

export const StarsTopup: React.FC = () => {
  const [balance, setBalance] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<StarsPackage>(50);
  const [busy, setBusy] = useState(false);
  const [awaiting, setAwaiting] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const stars = await getStarsBalance();
      setBalance(stars);
      return stars;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onFocus);
    return () => document.removeEventListener('visibilitychange', onFocus);
  }, [refresh]);

  useEffect(() => {
    if (awaiting === null) return;
    let tries = 0;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      if (cancelled) return;
      tries += 1;
      const current = await refresh();
      if (cancelled) return;
      if (current !== null && current >= awaiting) {
        setAwaiting(null);
        setMessage('Оплата подтверждена Telegram. Кредиты зачислены!');
        triggerHaptic.success();
      } else if (tries >= 60) {
        setAwaiting(null);
        setMessage('Платёж пока обрабатывается. Баланс обновится после подтверждения Telegram.');
      }
    }, 1000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [awaiting, refresh]);

  const checkout = async () => {
    if (busy || awaiting !== null) return;
    setError('');
    setMessage('');
    setBusy(true);
    const previous = await refresh();
    try {
      const invoiceUrl = await createStarsInvoice(selected);
      const result = await openStarsInvoice(invoiceUrl);
      if (result === 'cancelled') {
        setMessage('Оплата отменена. Средства не списаны.');
      } else if (result === 'failed') {
        setError('Telegram сообщил об ошибке платежа. Попробуйте снова.');
      } else {
        // Client callback is not payment proof. Only the server-side
        // successful_payment update can increase the Stars wallet.
        setMessage('Ждём подтверждения оплаты от Telegram…');
        setAwaiting((previous ?? 0) + selected);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось открыть платёжное окно.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => { setOpen(true); setError(''); setMessage(''); void refresh(); }}
          className="flex items-center gap-1.5 rounded-app-xs bg-gold-gradient px-3 py-2 text-xs font-bold text-bgMain shadow-glow-gold transition-transform active:scale-95"
        >
          <Plus size={15} strokeWidth={3} /> Пополнить
        </button>
        <span className="rounded-app-xs border border-accentGold/20 bg-accentGold/10 px-2.5 py-2 text-xs font-bold text-accentBrightGold">
          ⭐ {balance === null ? '—' : balance} кред.
        </span>
      </div>
      {open && createPortal(
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/80 px-4 py-8 backdrop-blur-md"
          role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-label="Пополнение Telegram Stars"
            className="glass-card flex max-h-[90dvh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-card p-5 text-textPrimary">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">Пополнить ⭐</h2>
                <p className="mt-1 text-xs leading-5 text-textSecondary">
                  Цифровые кредиты для внутренних сервисов VVD CPA
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Закрыть"
                className="rounded-full border border-white/10 p-2 text-textSecondary"><X size={17} /></button>
            </div>
            <p className="rounded-app-xs border border-accentGold/20 bg-accentGold/10 p-3 text-xs leading-5 text-textSecondary">
              Пополнение через Telegram Stars (XTR). 1 Star = 1 внутренний кредит.
              Это не доллары, не партнёрский доход и не средства для вывода.
            </p>
            <div className="flex items-center justify-between rounded-app-xs border border-white/10 bg-white/[0.03] p-3 text-xs">
              <span className="text-textSecondary">Ваши кредиты</span>
              <strong className="text-accentBrightGold">⭐ {balance === null ? '—' : balance}</strong>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {PACKAGES.map((stars) => (
                <button key={stars} type="button" disabled={busy || awaiting !== null}
                  aria-pressed={selected === stars} onClick={() => setSelected(stars)}
                  className={'rounded-app-xs border px-2 py-4 text-center text-sm font-bold transition-colors ' +
                    (selected === stars ? 'border-accentGold bg-accentGold/15 text-accentBrightGold' : 'border-white/10 bg-white/[0.03] text-textPrimary')}>
                  ⭐ {stars}
                </button>
              ))}
            </div>
            <Button type="button" onClick={() => void checkout()} disabled={busy || awaiting !== null}>
              {busy || awaiting !== null ? <><Loader2 size={17} className="mr-2 animate-spin" /> Ожидание Telegram…</> : <>Оплатить ⭐ {selected}</>}
            </Button>
            {message && <p role="status" className="flex items-start gap-2 text-xs leading-5 text-textSecondary">
              {awaiting === null && message.startsWith('Оплата подтверждена') && <CheckCircle2 size={16} className="text-success" />}
              {message}
            </p>}
            {error && <p role="alert" className="text-xs text-error">{error}</p>}
          </section>
        </div>,
        document.body,
      )}
    </>
  );
};
