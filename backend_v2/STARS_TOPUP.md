# Telegram Stars top-ups

This feature is initially **disabled** for real purchases. The UI displays the top-up screen but checkout is unavailable until the service owner launches actual digital products.

## Storage
Migration: `backend_v2/migrations/20261015_star_wallets.sql`. It adds RLS-protected `star_wallets` and `star_orders`. There are no `anon` or `authenticated` grants. It **never writes** the withdrawable CPA balance `users.balance`.

## Flow
- Mini App sends signed Telegram `initData` to the backend. Requests require a fresh HMAC verified against `BOT_TOKEN`.
- Backend creates a short-lived order and a real `XTR` invoice link when `STARS_PAYMENTS_ENABLED=true`.
- `Telegram.WebApp.openInvoice` opens the payment popup; the client callback **does not credit** the balance.
- Bot verifies `pre_checkout_query` and processes `successful_payment` using an atomic, idempotent database transaction.
- `refunded_payment` reverses credited Stars once. Reconciliation of failed payments must be monitored.
- UI polls the credit balance every second for up to a minute after invoice status and refreshes on returning to the Mini App.

## Deployment
The Render `vvd-cpa-v2` service uses the repository's `backend_v2` directory and tracks `main`. Its bot runs via polling by default. For a Telegram webhook, set **both** `TELEGRAM_WEBHOOK_URL=https://vvd-cpa-v2.onrender.com/telegram/webhook` and a strong `TELEGRAM_WEBHOOK_SECRET`; in webhook mode the bot registers an authenticated endpoint.

**Do not enable payments until** the digital goods that customers can redeem their purchased Stars credits for are available, charge/refund scenarios have been tested with Telegram, terms and support are ready, and the Render deployment and database migration are healthy.

The following flags must remain absent or false before launch:
- `STARS_PAYMENTS_ENABLED=false`

No Stars-to-USD conversion and no withdrawal of Stars credits are implemented. The separate testing credits currently shown in the Tools section are demo-only and are not connected to this wallet.
