# Mobile checkout verification

## Cause

The global proxy purchase switch is enabled, but `SUPPORTED_PURCHASE_TYPES` contains only `ipv6`. The frontend correctly checks that list; the backend rejects Mobile before reservation or a paid provider call. A valid quote (GBR, 3 days, 1 IP, three_unitedkingdom, rotation 0, $33.80 in the supplied example) does not prove delivery readiness.

## Changes

The backend now explains the exact blocker: the supplier does not link the issued Mobile inventory to an order, and safe automatic delivery is unconfirmed. Catalogue and existing-order UI show that reason. The disabled catalogue button references the explanation for accessibility.

Fixed a separate stale-quote race: a late price response cannot overwrite a newer selection. No tariff endpoints, markups, wallet code or live eligibility were changed.

## Isolated Mobile lifecycle tests

Disposable PostgreSQL and mocked provider only. A scoped test patch permits Mobile **only within the test**; no production test mode or purchase bypass is added. The provider mock supplies a $26 cost, retail $33.80, GBR / 3 days / 1 IP / three_unitedkingdom / rotation 0.

Tests cover server calculation, preparation/replay, one payment, durable before-snapshot and receipt, delayed/partial/excess inventory, foreign-owner denial, price changes, insufficient provider/customer balances, timeout with retained reserve and forbidden resubmission/refund. Even an exact inventory delta returns no credentials: it requires manual ownership review. Existing tests cover concurrent reservations, restart barriers, known linked deliveries, financial receipt uniqueness and refunds.

Frontend tests cover blocked Mobile with price, hypothetical server-enabled Mobile (mock only), changed-price confirmation and late quotes. Browser fixtures verify the actual catalogue button and explanation at 320px and 390px without paid or external requests.

## Readiness

Mobile can execute its order/payment path in isolated tests, but **automatic real Mobile sales remain NOT ready** because the supplier offers no reliable order linkage and dashboard purchases can race with an inventory delta. No unverified item is delivered. Independent confirmation of assignment or provider-supported linkage is required before changing eligibility. No real paid test, secret change, markup change, balance edit or database migration is performed.
