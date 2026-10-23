# Tools USD top-ups with Telegram Stars

Scope: tools only. Existing `tool_wallets` and `tool_transactions` remain the ledger. No changes to CPA earnings, payouts, referrals, or old `star_wallets`. Demo top-ups stay separate and are no longer shown in the production top-up screen.

## Deployment / configuration

Apply `backend_v2/migrations/20261023081155_tools_stars_usd.sql` before deploying backend. It is additive except for expanding existing provider/status constraints; no balances or history are deleted. Retain existing `BOT_TOKEN` and Telegram update delivery (polling or secret-protected webhook).

- `TOOLS_STARS_PER_USD`: owner-defined merchant price, Stars per USD of internal tools credit; decimal 1–100000 with at most six decimal places. No default tariff. Invoice amount in Stars rounds UP to a whole Star.
- `TOOLS_STARS_ENABLED=true`: enable creation/pre-checkout only after pricing and launch verification. Default false. Disabling does not block recovery or settlement of previously paid invoices.
- The existing `CRYPTO_PAY_API_TOKEN` is not used or changed.

The owner still needs to set the tariff, approve purchase/refund conditions, confirm real tools fulfilment is ready, and perform a provider test-account end-to-end payment/refund before enabling production. Automated tests use mock Telegram responses and isolated PostgreSQL; they are not evidence of an actual Telegram checkout.

The UI states that this is nonwithdrawable internal tools credit, shows both USD and Stars before checkout, and requires acceptance. Invoice records store the terms version and acceptance time. `/paysupport` opens the existing support screen. Complete merchant-specific terms/identity before launch; this text is not a replacement for them.

## Routes / events

- Authenticated `GET /tools-market/topup-config`: configured tariff and availability.
- Authenticated `POST /tools-market/topup`: amount, UUID request_id, expected_stars and terms_version=tools-stars-v1. Identity comes exclusively from signed initData. The quoted Stars value must match server pricing.
- Authenticated `GET /tools-market/payment-invoices`: owned invoice status and payment link.
- Existing `GET /tools-market/wallet` / `transactions`: real USD wallet / ledger; wallet includes refund_debt.
- Existing Telegram update delivery routes `vvdtools:` pre_checkout_query / successful_payment / refunded_payment to the tools handler. Browser openInvoice callbacks never credit money.
- Every 60 seconds, server-authenticated getStarTransactions is fully paginated to recover missed payments/refunds. No public settlement route.

Creation is deduplicated by owner/request UUID and by matching active amount/price. Ambiguous createInvoiceLink failures reuse the same invoice payload; at most one distinct pre-checkout query can be approved. A checkout whose completion is uncertain may remain unavailable for a new attempt until the 30-minute invoice expires; do not clear the guard blindly.

Settlement locks the invoice and wallet; charge ID and invoice/kind ledger uniqueness prevent duplicate credits. A DB exception rolls back ledger, balance and invoice together. Paid expired invoices are reconciled. Refunds arriving first produce both audit entries with zero net credit; spent refunds record nonnegative debt, settled by subsequent top-ups. Future purchasing adapters must reject debt and never spend reserved or unavailable funds.

Full history reconciliation prioritizes completeness over throughput; high-volume operation will need a durable provider-history cursor with overlap. No real-money test is performed by automation.

## Verification

`DATABASE_URL` must refer to a dedicated database named `tools_stars_test` (never production):

```sh
PYTHONPATH=backend_v2 python -m unittest discover -s backend_v2/tests -p test_tools_stars.py -v
npm run build
```

Tests cover unpaid/paid, 16 concurrent duplicate callbacks, owner/amount/currency mismatch, repeated creation and provider timeout, checkout guard, late payments, rate changes, refund ordering/debt, charge reuse, injected DB failure/rollback, history recovery, and denied client database writes.
