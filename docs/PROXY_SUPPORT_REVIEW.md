# Proxy-IPv4 support follow-up

## Mobile catalogue

The old code called `get/mobile/tariffs`. The owner supplied official support's correction: `GET get/tariffs`, without invented query parameters. Both catalogue and quote now use that route. The expected catalogue shape is `tariffs[] -> country, mobileOperator[] -> name, rotationTime[]`; only validated public fields are returned. Missing/invalid operators and rotations cannot produce a quote. A 404 explains that support clarification is required, rather than pretending an empty successful catalogue.

A single read-only startup probe per process verifies the real supplier response after deployment. It logs only configuration presence booleans, field names and public country/rotation counts. No key, account balance, credentials or purchase request is logged. Live results must be confirmed separately in the deployment report; mocks do not prove the real schema.

## Inventory comparison and ownership

Support confirms that IPv4/ISP/Mobile inventories have no orderId and no order filter. Existing snapshots (`proxy_ids_before`), supplier order reference, submission time and financial status remain in the existing order table. No migration is needed.

`proxy_inventory_review.py` evaluates the before/after difference, exact count, country, timezone-aware start-time window, IDs already associated with another order and unresolved lane state. Disappearing baseline IDs, excess IDs, invalid entries, wrong country/time and overlapping IDs are ambiguous. Missing/partial candidates stay waiting/partial. Candidate IDs never authorize credentials and are not stored as verified delivered IDs.

Even a perfect match cannot distinguish a concurrent purchase in the supplier dashboard. Such candidates require independent manual verification. Existing owned-order delivery may report a review state but returns no unverified connection data. IPv6 continues to use explicit supplier orderId. All order lookups still require Telegram authentication and ownership.

## Serialization and restart

PostgreSQL session advisory locks already serialize supplier submission by type across workers. Added a durable unresolved-predecessor check under that lock: a new same-type order cannot run while another is reserved/submitting/uncertain. For non-IPv6, previous fulfilled orders also require review before a new snapshot-based purchase. A Render restart releases locks but does not erase the durable blocker. No automatic paid replay or blind refund is introduced.

This is a fail-closed serialized purchase lane, not a new background purchase queue. IPv4/ISP/Mobile remain unavailable for real purchase. Do not enable them until exclusive supplier-account usage or independently verified assignment is established. No automatic account-inventory inference can prove that condition.

## Verification / scope

Mocks cover tariff shape, 404, missing fields/operator/rotation, exact/partial/delayed/extra inventory, wrong country/time, overlap, external changes, replay and restart. Disposable PostgreSQL tests verify unresolved orders block another owner after process restart. Existing concurrency, financial, ownership, connection-copy, UI and browser tests remain.

Changed modules are only proxy catalogue/delivery, their types/UI, tests and this report. Purchase flags, API keys, markups and balances are unchanged. No real paid operation is used for testing. No renewal route or guessed provider method was added.
