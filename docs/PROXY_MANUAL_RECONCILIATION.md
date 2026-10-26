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
