import { apiRequest } from '@/shared/lib/api';

export type StarsPackage = 50 | 100 | 250;
export type InvoiceStatus = 'paid' | 'pending' | 'cancelled' | 'failed';

function telegramInitData(): string {
  const data = window.Telegram?.WebApp?.initData;
  if (!data) throw new Error('Откройте Mini App внутри Telegram, чтобы пополнить баланс.');
  return data;
}

export async function getStarsBalance(): Promise<{ stars: number; payments_enabled: boolean }> {
  const result = await apiRequest<{ stars: number; currency: 'XTR'; payments_enabled: boolean }>('/payments/stars/balance', {
    headers: { 'X-Telegram-Init-Data': telegramInitData() },
    cache: 'no-store',
  });
  return { stars: result.stars, payments_enabled: result.payments_enabled };
}

export async function createStarsInvoice(stars: StarsPackage): Promise<string> {
  const result = await apiRequest<{ invoice_url: string }>('/payments/stars/invoice', {
    method: 'POST',
    headers: { 'X-Telegram-Init-Data': telegramInitData() },
    body: JSON.stringify({ stars }),
  });
  return result.invoice_url;
}

export function openStarsInvoice(invoiceUrl: string): Promise<InvoiceStatus> {
  const tg = window.Telegram?.WebApp;
  if (!tg?.openInvoice || !tg.isVersionAtLeast('6.1')) {
    throw new Error('Обновите Telegram, чтобы использовать оплату Stars.');
  }
  return new Promise((resolve, reject) => {
    try {
      tg.openInvoice(invoiceUrl, (status) => resolve(status));
    } catch (error) {
      reject(error);
    }
  });
}
