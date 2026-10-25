# Owner-authorized checkout activation

Scope: existing numbers and proxy tools only. The owner explicitly authorized activation after mocked validation. No real paid operations are performed by the developer; no keys, markup rates or existing balances are edited. No migration is required.

## Why buttons were disabled

The prior task intentionally set NOIR_SMS_PURCHASES_ENABLED=0 and PROXY_IPV4_PURCHASES_ENABLED=false. Published frontend and backend matched commit 24ca7da. Both flags were confirmed false in Render startup logs. The checkout configuration is the frontend source of truth.

## Corrections

- Explain unavailable checkout in both catalogues and prepared proxy orders.
- Respect supported_purchase_types on frontend AND backend. Only IPv6 has documented order linkage; IPv4/ISP/Mobile cannot be purchased until verified delivery is implemented for them. Catalogue/price reads remain available for all four types.
- Remove contradictory hardcoded false fields from proxy readiness/config responses.
- Do not claim delivery solely from successful payment.
- If prepare returns a different retail amount than the user confirmed, do not submit payment. Request fresh price confirmation.

## Validation

Retain Noir catalogue, Decimal 30%, low balance, confirmed rejection release, unknown result retention, replay/concurrency, SMS, refund and ownership tests. Add disposable PostgreSQL IPv6 prepare/pay/replay/exact-linked-delivery/partial/foreign-owner cycle and timeout/unsupported-type tests. All external supplier responses in tests are mocked. UI tests cover disabled reasons, type gates and price changes. Build includes TypeScript checking.

## Authorized rollout

After CI and code publication, set only NOIR_SMS_PURCHASES_ENABLED=1 and PROXY_IPV4_PURCHASES_ENABLED=true through a merge-only environment update, then verify the deployed commit and startup flags. Effective proxy purchase types remain IPv6 only. Actual rollout status belongs to the deployment report, not an assumed result of changing source code.

## Remaining risks

Noir: supplier funds are required; no successful live paid E2E issuance is claimed. Unknown purchases without a durable supplier receipt require verified reconciliation, never blind retry/refund.

Proxy: IPv6 is eligible for an independent controlled test. IPv4/ISP/Mobile remain blocked because account-wide inventory cannot prove ownership. Post-submission uncertainty retains the reservation and requires reconciliation. Active inventory may not retain expired connection data. The developer does not purchase goods for testing.

Independent review should cover real provider behaviour before expanding sales. Official contracts: https://noirsms.com/api/docs/ and https://docs.proxy-ipv4.com/developers-api/buy-and-manage-ip .
