import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getStarsBalance } from '@/shared/lib/stars';

// One verified, non-withdrawable Stars wallet shared by Home and all Tools pages.
// Never optimistically modify the balance: only Telegram's server-side payment
// handler may credit it, and future trusted fulfillment code may spend it.
type WalletState = {
  stars: number | null;
  paymentsEnabled: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<number | null>;
};

const StarsWallet = createContext<WalletState | null>(null);

export const StarsWalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [stars, setStars] = useState<number | null>(null);
  const [paymentsEnabled, setPaymentsEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<number | null> => {
    if (!window.Telegram?.WebApp?.initData) {
      setError('Кошелёк доступен внутри Telegram.');
      setStars(null);
      setPaymentsEnabled(false);
      return null;
    }
    setLoading(true);
    try {
      const current = await getStarsBalance();
      setStars(current.stars);
      setPaymentsEnabled(current.payments_enabled);
      setError(null);
      return current.stars;
    } catch {
      setError('Не удалось загрузить Stars-кошелёк.');
      setPaymentsEnabled(false);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const whenVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', whenVisible);
    return () => document.removeEventListener('visibilitychange', whenVisible);
  }, [refresh]);

  const value = useMemo<WalletState>(
    () => ({ stars, paymentsEnabled, loading, error, refresh }),
    [stars, paymentsEnabled, loading, error, refresh],
  );

  return <StarsWallet.Provider value={value}>{children}</StarsWallet.Provider>;
};

export const useStarsWallet = (): WalletState => {
  const value = useContext(StarsWallet);
  if (!value) throw new Error('StarsWalletProvider missing');
  return value;
};
