# IPv4, ISP and Mobile readiness — 2026-10-26

All three types are deliberately absent from `SUPPORTED_PURCHASE_TYPES`; only IPv6 is enabled by that server allowlist. The global purchase flag does not override this restriction. The catalogue and quote remain available, and the UI displays the server's ownership-verification explanation without discarding the quoted price.

Mobile uses the support-confirmed `GET get/tariffs`, not `get/mobile/tariffs`. Existing normalization validates country, operator and rotation; missing or unsupported values fail explicitly.

## What the inventory comparison proves

Before submission, the server persists the type-specific inventory IDs and submission timestamp. After confirmation, inventory review checks count, country, time, overlaps with known assignments and unexpected changes. A matching delta still cannot exclude a purchase made directly in the provider account. Therefore candidates are not assigned or exposed to the buyer; an exact match remains `external_purchase_cannot_be_excluded`. Partial candidates are likewise not delivered.

A PostgreSQL advisory lock serializes the supplier lane. Persisted unresolved orders block a subsequent same-type purchase even after loss of process locks. No automatic retry submits another paid order. Unknown outcomes retain the reserve; receipt settlement is idempotent. These controls do not establish ownership of inventory changes from outside VVD CPA.

## Expanded verification

The disposable PostgreSQL checkout fixture now runs independently for IPv4, ISP and Mobile. It tests quote/prepare, replay with one supplier call, settlement, no disclosure of ambiguous inventory, other-user access denial, delayed/partial/excess inventory, changed price, insufficient supplier/customer funds, timeout with retained reserve, and an earlier process's unresolved lane belonging to another owner. Mobile-only payload fields are asserted absent for IPv4/ISP.

Eligibility is overridden only inside test mocks. The production allowlist, financial logic, balances, markup, API keys, frontend and deployment configuration are unchanged. Test fixtures never contact a supplier.

## Remaining launch blocker

All three types are ready for independent **mock-based review**, not unattended live delivery. A trustworthy ownership confirmation or a separately reviewed reconciliation procedure is still needed. No production type is enabled by this change. Existing runtime from PR #84 remains the deployed implementation; this follow-up adds tests and this report only, and requires no migration or runtime redeployment.
