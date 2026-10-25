# Proxy delivery UI

UI scope: existing MyProxies and its owned-order delivery route. The subsequent purchase-readiness stage also hardens the proxy wallet and authorizes publication with purchases disabled; see [current readiness report](TOOLS_PURCHASE_READINESS.md). No real purchase or production migration is performed. Keys and markups are unchanged.

## Provider contract and ownership

Reviewed official documentation on 2026-10-25:
https://docs.proxy-ipv4.com/developers-api/buy-and-manage-ip

`GET get/proxies?proxyType=...` returns the account inventory, not a customer-specific inventory. IPv6 entries are groups with `orderId` and `ips`. Individual items contain `id`, `ip`, `httpsPort`/`socks5Port` or an embedded gateway port + `protocol`, `authInfo`, `dateEnd`. Mobile additionally supplies operator and rotation interval.

The existing non-IPv6 checkout inferred customer ownership from inventory differences. External purchases can race despite the application lock, so this is not sufficient proof. Delivery no longer trusts old `delivered_proxy_ids` inferred this way; the records are not deleted. New checkout no longer assigns inventory differences. Related reservation safeguards are documented in the readiness report.

The route first authenticates Telegram, then selects the local order by BOTH ID and owner. Only `fulfilled` orders with a stored supplier order reference can proceed. Only supplier entries with an exact matching order reference are selected. Conflicting references are rejected; IPv6 is flattened only after matching its parent order. A narrow allowlist returns connection fields; no raw inventory, account metadata, reboot links or API secrets. Invalid/incomplete endpoints and duplicate IDs do not count as delivered. Empty, partial and excessive results cannot report full delivery.

**API limitation:** documented IPv4/ISP/Mobile examples do not contain an order reference. Those products remain awaiting verified assignment if the real provider response lacks it, even when old heuristic IDs exist. Do not re-enable approximate matching. A provider-supported order-to-IP lookup or an independently verified assignment workflow is required before claiming complete delivery for those products. No live supplier response or paid operation was used for this UI task.

Only active inventory is documented. Historical orders remain in the database; credentials for expired/removed supplier inventory cannot be reconstructed. Refresh does not create orders or pay again.

## UI

Individual order and proxy cards; separate payment/delivery status; actual count versus purchased count; hidden password and reveal/hide; compact 18px Copy/Check in 44px tap targets; copy exact field or protocol-specific URI; URI credentials escaped, IPv6 hosts bracketed. HTTPS supplier port is formatted as an HTTP CONNECT proxy URI. No invented credentials. Dates come only from supplier `dateEnd`.

One sequential polling loop: 10 seconds, maximum 30 cycles; up to 5 consecutive per-order failures; list errors back off up to 60 seconds. Manual refresh resumes. Fully delivered/terminal orders are not automatically polled. Unmount prevents further work and stale updates. In-flight API reads deduplicate within the current Telegram session and reject responses from an old session. Secrets are held only in component/in-flight memory, never persisted or logged.

## Verification

- `python -m unittest backend_v2.tests.test_proxy_delivery backend_v2.tests.test_proxy_seller_demo -v` (mocked database/provider, no live DB)
- `node --test tests/proxy-delivery-ui.cjs tests/my-numbers-ui.cjs tests/noir-ui.cjs`
- `npm run build` includes TypeScript check.
- Dedicated `validate-proxy-delivery.yml` runs the same checks on PRs, without production deployment.

Before publishing, review backend and frontend together: the delivery response is normalized for this UI. Publication is authorized by the subsequent readiness task, while real purchases remain disabled. Real Telegram/device verification and real supplier attribution remain separate checks, not claimed by mocked tests.

Verification completed: 30 frontend tests (12 proxy-specific, 18 existing numbers/catalogue regression tests), 15 backend tests, TypeScript and production build passed. Chromium in GitHub Actions also passed browser checks at 320px and 390px: no horizontal overflow, hidden password by default, reveal/hide, no page errors. Fixtures prohibit purchases and external network requests.

Screenshots (mock data, not live orders): [320px partial delivery](proxy-320.png), [390px full delivery](proxy-390.png).

Browser verification: https://github.com/vitalujs2233/vvd-cpa/actions/runs/40233861014

Local Chromium failed to launch; GitHub Actions supplied the browser verification and screenshots. Actual Telegram/iPhone/Android testing and real supplier attribution were not performed. See the readiness report and release confirmation for the subsequent publication stage.

