# Proxy inventory reconciliation (IPv4 / ISP / Mobile)

## Audit and changes

PR #85 already persisted the pre-purchase ID snapshot, supplier receipt and submission time. PostgreSQL advisory locks serialize same-type checkout across instances; durable pending/uncertain records survive process loss. Previously the comparison checked only count/country/start time and never authorized a delta. No durable review report, assignment constraint or administrator decision log existed.

This change adds strict rental duration (`dateEnd - dateStart == days * 24h`), Mobile operator and integer rotation checks, a 15-minute operational review deadline, durable review state, unique `(proxy_type, proxy_id)` assignments and an administrator audit trail. Missing timestamps/timezones or metadata fail closed. The deadline is not a supplier SLA: 90 seconds or several minutes is accepted. Delayed/partial inventory never releases the lane. Polling after a deadline persists manual review; no background scheduler is added. Even without polling, the existing durable order keeps the lane blocked.

Purchase availability remains IPv6-only. No account exclusivity is inferred from inventory. No automatic assignment is introduced for the three blocked types. A same-type lane is released only after a complete manually approved assignment; uncertain payment still blocks it. Existing financial settlement remains unchanged: confirmed supplier acceptance may already be settled; an uncertain payment retains its reserve. Review never refunds, settles, releases money, changes markup, or submits a paid request.

## Administrative procedure

Use existing signed Telegram administrator authorization (`X-Telegram-Init-Data`); ordinary users receive 403. No new admin role or publicly accessible inventory endpoint is introduced. This is an administrative API procedure, not a new admin UI.

1. POST `/tools-market/proxy-ipv4/admin/orders/{id}/review`.
   Returns internal ID, supplier orderNumber, selection, payment status, candidate IDs and check results. Records the inspection in the audit log. Connection passwords are excluded.
2. Independently verify the supplier receipt and the account's operation history for the entire snapshot-to-delivery period. Confirm the account is dedicated and no dashboard, other integration, renewal, cancellation, or manual purchase altered inventory. Check exactly the expected IDs, country, dates/duration, operator/rotation, and complete connection data. If evidence is insufficient, leave the order for manual review; do not release the lane or refund an unknown result.
3. POST `/tools-market/proxy-ipv4/admin/orders/{id}/approve` with:
   `{"evidence_ref":"support-ticket:12345","exclusive_account_confirmed":true,"candidate_ids":["supplier-id"]}`.
   The reference points to retained independent evidence, never credentials. This explicit administrator attestation is required; a matching delta alone is not sufficient. The endpoint locks the same PostgreSQL lane, reloads inventory, reruns all checks and assigns every ID atomically. Missing connection data, changed candidates, unconfirmed payment or overlapping IDs reject approval. Replay of an identical approved set is read-only and audited.
4. GET `/tools-market/proxy-ipv4/admin/orders/{id}/audit` to review the last 100 events. The read itself is audited. Rejected approvals are logged without provider payloads. No API edits/deletes audit history.
5. The buyer's existing owner-checked delivery route returns only approved IDs for these types. Legacy `delivered_proxy_ids` alone never authorizes disclosure. The association to orderNumber is through the existing order row. Reopening performs reads only; it never repeats payment.

Administrative approval is a trusted human action, not cryptographic supplier proof. Do not approve without the independent evidence above. There is deliberately no force-assignment, manual lane-release, refund or override endpoint. An uncertain supplier payment must first be resolved through the existing separately verified financial reconciliation process.

## Account requirements and remaining risks

- Dedicated provider account with no unrelated dashboard/API purchases or other resellers. Restrict account access and keep independent operational evidence.
- One configured account; do not rotate to another account while orders or ownership history exist. IDs are namespaced by type within that account.
- No parallel same-type operation outside this application. Human exclusivity attestation cannot be mechanically verified through this supplier API.
- Preserve snapshots, submission timestamps, receipts, claims and audit records across deployment. Never clear these to unblock a queue.
- Supplier must supply stable unique IDs and usable timezone-aware start/end dates; Mobile must return operator and rotation. Unconfirmed formats remain blocked, not guessed.
- Provider outages may prevent displaying current connection data. They do not remove claims or restart a purchase.
- This release validates mocked API lifecycles only; it does not certify real paid issuance or enable purchases.

## Migration and rollback

Apply `supabase/migrations/20261026103820_proxy_inventory_review.sql` before deploying backend. It adds only three delivery metadata tables, RLS and revokes client roles. Existing orders/wallets are unchanged; old inferred IDs are not migrated into trusted claims.

Rollback backend to the prior commit first. Retain these tables and audit history; dropping ownership records is not a safe rollback or queue reset. No frontend changes are needed.

## Follow-up audit: historical evidence (2026-10-26)

Audited baseline: main c00ed685 (PR #86), also the live Render commit at audit start.
Confirmed Supabase has the review/assignment/audit tables with RLS enabled and the
unique (proxy_type, proxy_id), supplier receipt and owner/request indexes. At the
read-only inspection, the order table contained seven prepared IPv4 intents and
no submitted/fulfilled orders. This is not evidence of a successful paid delivery.
Render has one instance, auto-deploy off, and no HTTP health-check path configured.
Runtime logs confirm presence of the existing key, markup and purchase flag and a
successful Mobile tariff probe. No secret values were retrieved or changed.
The global purchase flag is true; the code allowlist still permits only IPv6.

Fixed in this follow-up:
- Malformed inventory entries are rejected instead of silently filtered. Missing
  inventory is not interpreted as an empty account. Invalid baseline IDs fail closed.
- All observed candidate IDs and conflicting checks survive subsequent snapshots,
  supplier outages and backend restarts. Disappearing candidates are a conflict.
- A later apparently matching inventory plus an exclusivity checkbox cannot erase
  a previously observed mismatch or extra proxy. Approval remains blocked.
- The review endpoint returns the persisted sticky state. Changed observations,
  including changes within manual_review, are audited without credentials.
- Denied approval persists its conflicting observation before returning an error.

Ordinary growth from partial delivery to the exact set, including after 90 seconds
or a timeout, remains eligible for explicit administrative review. Historical
conflicts require independent supplier investigation; this API deliberately has
no override or queue-release action for them. Retain the provider's evidence and
commission a separately reviewed resolution if a conflicting order must be closed.
Previously overwritten observations cannot be reconstructed by this patch.

### Scope of readiness for each product

| Product | Existing functionality and ownership checks | Follow-up corrections | Remaining launch conditions |
| --- | --- | --- | --- |
| IPv4 | Catalogue/quote, reserved wallet, one-shot checkout, durable lane, exact ID count/country/duration and audited manual assignment | Strict inventory parsing, durable conflict history and approval guard | Dedicated unchanged provider account; independently verified no external operations; verified live date formats; approved uncertain-payment/refund procedure |
| ISP | Same pipeline and per-type lane; unique assignments and owner-only credential route | Same fixes and separately parametrized lifecycle tests | Same conditions as IPv4 |
| Mobile | Same pipeline plus operator and integer rotation checks; ID identity permits a shared IP with different ports | Same fixes and separately parametrized lifecycle tests | Same conditions plus verified operator/rotation formats and real-account issuance evidence |

All three remain disabled. They are candidates for independent review of this
restricted manual-assignment design, not approved for automatic paid launch.
The durable lane is an admission gate (409 for a competing request), not a FIFO
worker queue. It survives restart through unresolved database rows. A delayed or
partially delivered order never starts another supplier submission. Timeout state
is materialized on customer/admin polling, not by a background scheduler; even
without polling the durable order blocks further same-type purchases. Unknown
payment outcomes preserve reserves and are not resolvable through the delivery
approval endpoint. A complete operational process for those cases remains a launch
prerequisite. No new financial settlement/refund authority is introduced here.

### Verification

Local: 37 backend unit tests, 36 frontend tests, TypeScript/Vite production build.
The PR runs disposable PostgreSQL lifecycle tests, including distinct OS-process
advisory locks, restart, historical conflict, replay, wallet and foreign-owner
checks for all three products; mobile browser tests run at 320 and 390 pixels.
All supplier calls in these tests are mocks. No paid purchase was attempted.
