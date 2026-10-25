# Noir SMS catalogue and tools ledger

## Scope and architecture
- `main.py` mounts `/tools-market/numbers`; existing Proxy-IPv4 routes and purchasing code are unchanged.
- `stars_payments.require_telegram_id` verifies signed, fresh Telegram initData; the frontend sends `X-Telegram-Init-Data`. No body-supplied owner ID is accepted.
- Catalogue code has a GET-only allowlist (`countries`, `services`), no SMS delivery or supplier mutations.
- Internal routes: GET `status`, `countries`, `services?country=us`, `prices?country=us&service=...`. POST `orders` always returns 503. All require Telegram authentication.
- Existing wallet: `tool_wallets.available/reserved/refund_debt`, USD. History: `tool_orders`, `tool_transactions`. No new wallet or separate Noir balance.

## Supplier contract
Verified documentation: https://noirsms.com/api/docs/ and https://noirsms.com/api/resellers/ (2026-10-25).
Base `https://noirsms.com/api/v1/`; server-only Bearer authentication from `NOIR_SMS_API_KEY`.
GET `/countries`: `countries: [{country, services}]`.
GET `/services?country=xx`: `country`, `currency: USD`, `services: [{service,name,price,stock}]`.
No separate supplier prices route is needed. Documented limit: 120 requests/minute/key; no sandbox. Supplier rules prohibit bulk account creation, evasion and KYC bypass. Purchases/verification-code delivery are out of scope and remain disabled.

## Catalogue implementation
Decimal parsing; retail = cost × 1.30, ROUND_HALF_UP to cents. Zero/negative/non-finite prices and unsupported currency fail closed. Missing price does not become zero. Cost remains server-side; responses use explicit projections.
Countries cache: 60 seconds; services/quotes: 20 seconds. Per-process lock coalesces concurrent requests. Maximum 20 supplier reads/minute/process, cooldown after rate limits; no automatic retries. Deployment must budget this ceiling across all processes/instances and other users of the same provider key. No assumption of an unlimited distributed rate budget.
Provider request total timeout: 12 seconds; route budget: 15 seconds; redirects refused. Only local error codes are logged.
UI rejects late responses from previous selections, expires displayed quotes, and offers manual refresh. Purchase stays disabled.

## Internal financial infrastructure
`tools_order_ledger.py` is not mounted on HTTP and has no Noir adapter. Its caller must be a reviewed server workflow with verified identity, current server quote and authoritative supplier outcome.
Reuses existing order and transaction tables, adding nullable ledger metadata and one unique owner/request index. Existing orders and proxy intents are not migrated into another system. Cost precision is widened without rounding existing values.
Reserve inserts/locks the idempotent order and atomically moves available funds to reserved. Claim transitions before the single external attempt. Unknown outcomes retain the reserve for reconciliation. Confirmed fulfilment commits wallet, transaction and order together. Confirmed rejection releases once; confirmed refund credits once. Receipt uniqueness and PostgreSQL locks protect concurrency. Credits first reduce existing refund debt.
No automatic retry of a purchase after a crash or timeout. No real ledger operations are exposed for Noir.

## Deployment and verification
Only `NOIR_SMS_API_KEY` is required. Do not copy its value from Render.
Optional temporary `NOIR_SMS_CATALOG_PROBE=1` performs catalogue GETs on startup and logs counts plus one retail price, not secrets/cost/balance. Set back to `0` after verification.
Run `test_noir_catalog.py`; run `test_tools_order_ledger.py` ONLY with `TOOLS_LEDGER_TEST_DB=1` on disposable PostgreSQL. CI supplies isolated PostgreSQL 16. Run `node --test tests/noir-ui.cjs` and `npm run build`.
Apply the additive `*_tools_order_ledger.sql` migration after tests. Manual Render deployment is required; Pages uses existing deployment workflow.
Production acceptance must distinguish server GET verification from an authenticated Telegram UI test. Never claim live buying works.

## Safe rollback
Roll back the code first. Do not drop ledger fields after real ledger orders exist. For an unused ledger, the guarded SQL in `tools_order_ledger_rollback.sql` removes only new metadata and index; it refuses rollback if ledger history exists or narrowing cost would lose precision. Never delete balances/history.
