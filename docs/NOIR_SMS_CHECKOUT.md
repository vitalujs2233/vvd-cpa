# Noir checkout rollout

Only numbers pages, Noir adapters and order metadata change. Existing Proxy-IPv4 and Stars operations remain unchanged. The existing tools wallet is the only wallet.

## Activation
Apply `*_noir_orders.sql` after the ledger migration. Deploy backend and Pages, then set `NOIR_SMS_PURCHASES_ENABLED=1` in Render. API key remains `NOIR_SMS_API_KEY`. Setting the purchase flag to 0 blocks new purchases but keeps reconciliation and viewing active.

## Provider contract
Official documentation: https://noirsms.com/api/docs/
POST /numbers accepts service, country and max_price; success returns the provider UUID and delivery. GET /numbers/{id} returns current status and SMS. No supplier POST retry is performed. The documented API does not specify an idempotency header or client reference.

## Money and recovery
A fresh supplier quote must match the customer-confirmed price. Reserve uses the existing tools ledger, verified Telegram owner and unique request ID. Claim is committed before the single POST. Fulfilment stores the validated delivery, actual cost, exactly 30% retail price, wallet debit and purchase transaction in one PostgreSQL transaction. A lower actual cost releases the difference. Ownership is checked before every read.

Known expiry/cancellation with no SMS refunds the entire retail charge exactly once. GET polling and a background reconciliation loop continue after the visitor leaves. No purchase is retried after timeout, malformed response or crash. Explicit documented no-charge errors release the reserve; ambiguous outcomes retain it. New purchases are blocked for an owner with an unresolved order.

## Important operational limitation
If a process fails after provider acceptance but before the response is durably stored, there is no documented provider correlation token. The order remains submitting/unknown and requires manual reconciliation by the platform owner in Noir. Do not match or refund automatically by country/price/time alone. Verify the provider order and ownership before settlement; require authoritative confirmation of non-purchase before release. Use internal ledger operations only after verification. No public reconciliation override or automatic retry exists. The platform owner must handle these exceptional cases; the UI directs the customer to support with the local order ID.

The initial UI supports purchase, number copying, waiting, SMS history and automatic expiry refund. Manual cancellation/resend/finish controls are not exposed. Received messages are owner-only and never included in logs. Catalogue prices are not a guarantee until server checkout confirms them.

## Verification
CI uses disposable PostgreSQL and mocked supplier responses only. Test duplicates, concurrency, unknown outcomes, explicit rejection, lower price, refund replay, ownership, changed quotes and the feature gate. Actual paid purchase is not part of automated tests. An end-to-end live test requires the owner to choose a country/service and approve its current price.
