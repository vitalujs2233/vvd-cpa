# Proxy-Seller demo integration (VVD CPA)

This is a **non-transactional staging scaffold**, not a live Proxy-Seller integration.

- `GET /tools-market/proxy/config`: static example types, countries and durations; not actual stock.
- `POST /tools-market/proxy/quote`: authenticated, validates a selection, returns **no price** and never calls a provider.
- `POST /tools-market/proxy/purchase`: authenticated, always 503. No wallet debits, reservations, orders, or provider calls.
- Frontend `/tools/proxy`: demo selector. `/tools/my-proxies`: informational placeholder.

## Before enabling production

1. Obtain a Proxy-Seller account, API credentials, and written confirmation of reseller permission.
2. Confirm the API v2 order, pricing, inventory, duration, extension and credential contracts for both IPv4 and ISP; do not assume the demo selections exist.
3. Store API secrets only in Render environment variables; never expose them to React or GitHub.
4. Build a server-side adapter with timeouts, idempotency, reconciliation of unknown provider outcomes, and no blind retries.
5. Add atomic wallet reservation/settlement/refund and unique request IDs in PostgreSQL, then private order credential storage and owner-only reads.
6. Verify Telegram Stars and vendor terms, security, and test flows before turning on purchases.

Do not set the service status to `available` or remove the purchase gate before completing the checklist.
