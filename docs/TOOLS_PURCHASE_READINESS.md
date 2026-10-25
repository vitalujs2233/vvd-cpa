# Purchase readiness — 2026-10-25

Historical disabled-rollout audit. The later owner-authorized activation stage is documented in [CHECKOUT_ACTIVATION.md](CHECKOUT_ACTIVATION.md); that report supersedes the gates below.

Only existing tools/Noir/Proxy-IPv4 code is in scope. No keys, markup rates or production balances are edited. No real purchase is authorized or executed by this task.

## Rollout gates

Render config is explicitly set to `NOIR_SMS_PURCHASES_ENABLED=0` and `PROXY_IPV4_PURCHASES_ENABLED=false`. Viewing, catalogues and reconciliation remain available. Startup logs report only these booleans, never keys, phone numbers, SMS or proxy credentials. An explicit later approval is required before either flag may be enabled.

## Numbers / Noir

Official source: https://noirsms.com/api/docs/

Catalogue: GET countries, services?country; USD prices, stock and Decimal retail +30%. Checkout forces a fresh quote and sends the provider max_price. POST numbers is never retried after an ambiguous outcome. Explicit documented errors (including 402 insufficient_balance) release the reserve; unknown transport/malformed responses retain it for reconciliation. Reservation, successful settlement and expiry/cancellation refunds use transactions, row locks and unique receipt/request constraints. Owner checks protect history/SMS. Existing tests cover price changes, low balance, concurrency/replay, expiry refund replay, foreign owners, timeout and recovery.

Readiness: mock-tested, purchases OFF. A previous production attempt returned 402 (no provider funds), not a successful paid issuance. No successful live end-to-end purchase is claimed. Unknown accepted purchases without a durable receipt require manual verified reconciliation: the API does not document a client idempotency/correlation token. Resale must remain within the provider's acceptable-use rules; this integration does not automate account creation.

## Proxies / Proxy-IPv4

Official sources:
- https://docs.proxy-ipv4.com/developers-api/buy-and-manage-ip
- https://docs.proxy-ipv4.com/developers-api/possible-mistakes

Read-only delivery is scoped by local owner and exact provider order reference. IPv6 groups are expanded after matching orderId. No inventory-difference attribution. Empty or partial results remain pending. New UI shows connection cards and masked passwords.

The documented mobile tariff endpoint is get/mobile/tariffs (the old adapter used get/tariffs); this is corrected. Quotes/receipts must report USD and valid positive amounts; successful receipts must match proxyType. Existing markup is unchanged.

Wallet hardening: do not ignore duplicate transaction receipts; a uniqueness conflict rolls back the whole settlement. Production already has a unique provider_order_id index, providing an additional guard. New reservations serialize per owner and reject a different request while an earlier order is reserved/submitting/uncertain. Unknown outcomes cannot auto-release or repeat purchases. A provider error after submission remains conservatively uncertain until authoritative reconciliation; preflight insufficient balance does not reserve money.

Readiness: purchases OFF. IPv6 has documented order linkage, but no live paid E2E check was performed. IPv4/ISP/Mobile remain NOT ready for automatic sale when responses lack order references. Provider support must supply a reliable linkage; do not approximate by time, country or inventory differences. Automatic timeout reconciliation for these proxy orders is not complete: operators must handle unresolved states without retrying or refunding blindly.

## Database / scope

Read-only production schema audit: tool_wallets, tool_orders and tool_proxy_order_intents have RLS; anon/authenticated/PUBLIC have no table grants. Unique (telegram_id,request_id), provider_order_id and transaction external_payment_id constraints exist. No production DDL/DML or migration is needed for this patch. Tests run on disposable PostgreSQL only.

## Verification

Existing frontend, Noir ledger and delivery tests retained. Added disposable PostgreSQL proxy-wallet tests for concurrent reservation/settlement, duplicate financial receipts, insufficient funds, foreign owner, pre-submission release, unknown-result reserve retention, recovery and blocked new request; mocked route tests cover disabled purchases and official mobile tariffs/currency.

Publication of code/UI does not enable purchases. Confirm Render live, startup gates false, public health and auth rejection, and GitHub Pages after merging. A successful deployment is not evidence of successful provider issuance.
