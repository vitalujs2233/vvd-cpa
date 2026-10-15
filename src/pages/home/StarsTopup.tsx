import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { createStarsInvoice, openStarsInvoice, StarsPackage } from '@/shared/lib/stars';
import { useStarsWallet } from '@/shared/lib/StarsWalletContext';
import { triggerHaptic } from '@/shared/lib/telegram';

const PACKAGES: StarsPackage[] = [50, 100, 250];

export const StarsTopup: React.FC = () => {
  const { stars, paymentsEnabled, loading, error: walletError, refresh } = useStarsWallet();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<StarsPackage>(50);
  const [busy, setBusy] = useState(false);
  const [awaiting, setAwaiting] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (awaiting === null) return;
    let cancelled = false;
    let tries = 0;
    const timer = window.setInterval(async () => {
      if (cancelled) return;
      tries += 1;
      const current = await refresh();
      if (cancelled) return;
      if (current !== null && current >= awaiting) {
        setAwaiting(null);
        setMessage('Telegram подтвердил оплату. Кредиты зачислены!');
        triggerHaptic.success();
      } else if (tries >= 60) {
        setAwaiting(null);
        setMessage('Оплата ещё обрабатывается. Баланс обновится после подтверждения Telegram.');
      }
    }, 1000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [awaiting, refresh]);

  const checkout = async () => {
    if (busy || awaiting !== null || !paymentsEnabled) return;
    setBusy(true);
    setError('');
    setMessage('');
    const previousBalance = await refresh();
    try {
      const invoiceUrl = await createStarsInvoice(selected);
      const status = await openStarsInvoice(invoiceUrl);
      if (status === 'cancelled') {
        setMessage('Оплата отменена.');
      } else if (status === 'failed') {
        setError('Telegram сообщил об ошибке платежа.');
      } else {
        // Payment callback is not proof. Credit only after server-side
        // successful_payment, then retrieve the confirmed wallet balance.
        setAwaiting((previousBalance ?? 0) + selected);
        setMessage('Ждём подтверждения платежа от Telegram…');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось открыть счёт.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button"
          onClick={() => { setOpen(true); setMessage(''); setError(''); void refresh(); }}
          className="flex items-center gap-1.5 rounded-app-xs bg-gold-gradient px-3 py-2 text-xs font-bold text-bgMain shadow-glow-gold active:scale-95">
          <Plus size={15} strokeWidth={3} /> Пополнить
        </button>
        <span className="rounded-app-xs border border-accentGold/20 bg-accentGold/10 px-2.5 py-2 text-xs font-bold text-accentBrightGold">
          ⭐ {stars ?? '—'} кред.
        </span>
      </div>
      {open && createPortal(
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/80 px-4 py-8 backdrop-blur-md"
          role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) setOpen(false);
          }}>
          <section role="dialog" aria-modal="true" aria-label="Пополнение через Telegram Stars"
            className="glass-card flex max-h-[90dvh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-card p-5 text-textPrimary">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">Пополнить ⭐</h2>
                <p className="mt-1 text-xs text-textSecondary">Общий кошелёк инструментов VVD CPA</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Закрыть"
                className="rounded-full border border-white/10 p-2 text-textSecondary">
                <X size={17} />
              </button>
            </div>
            <p className="rounded-app-xs border border-accentGold/20 bg-accentGold/10 p-3 text-xs leading-5 text-textSecondary">
              Задумка: единые кредиты для AI, номеров и прокси.
              Они не являются долларами CPA и не подлежат выводу.
              Пока реальные услуги не подключены, покупать кредиты нельзя.
            </p>
            <div className="flex items-center justify-between rounded-app-xs border border-white/10 bg-white/[0.03] p-3 text-xs">
              <span className="text-textSecondary">Баланс Stars-кредитов</span>
              <strong className="text-accentBrightGold">⭐ {stars ?? '—'}</strong>
            </div>
            {!paymentsEnabled && (
              <p role="status" className="rounded-app-xs border border-accentGold/20 bg-accentGold/10 p-3 text-xs text-accentBrightGold">
                Платежи пока отключены. AI, номера и прокси доступны лишь в демо-режиме.
              </p>
            )}
            {walletError && <p role="status" className="text-xs text-textSecondary">{walletError}</p>}
            <p className="text-xs text-textSecondary">Варианты будущего пополнения:</p>
            <div className="grid grid-cols-3 gap-2">
              {PACKAGES.map((amount) => (
                <button key={amount} type="button" aria-pressed={selected === amount}
                  disabled={busy || awaiting !== null}
                  onClick={() => setSelected(amount)}
                  className={'rounded-app-xs border px-2 py-4 text-center text-sm font-bold ' +
                    (selected === amount ? 'border-accentGold bg-accentGold/15 text-accentBrightGold' :
                      'border-white/10 bg-white/[0.03] text-textPrimary')}>
                  ⭐ {amount}
                </button>
              ))}
            </div>
            <Button type="button" disabled={!paymentsEnabled || busy || awaiting !== null || loading}
              onClick={() => void checkout()}>
              {!paymentsEnabled ? 'Пополнение скоро появится' :
                busy || awaiting !== null ? <><Loader2 size={17} className="mr-2 animate-spin" /> Ожидание Telegram…</> :
                <>Оплатить ⭐ {selected}</>}
            </Button>
            {message && (
              <p role="status" className="flex items-start gap-2 text-xs leading-5 text-textSecondary">
                {message.startsWith('Telegram подтвердил') && <CheckCircle2 size={16} className="text-success" />}
                {message}
              </p>
            )}
            {error && <p role="alert" className="text-xs text-error">{error}</p>}
          </section>
        </div>, document.body,
      )}
    </>
  );
};
