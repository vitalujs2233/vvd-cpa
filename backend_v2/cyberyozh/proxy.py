"""Only dedicated, unlimited, per-unit LTE / static ISP products. No rotating pools."""
from .client import ProviderError, money, retail
from .numbers import identifier

class Proxy:
    def __init__(self, client):
        self.client = client

    def catalog(self):
        groups = self.client.rows('proxies/shop/', {'access_type': 'private'})
        offers = []
        for group in groups:
            if group.get('access_type') != 'private':
                continue
            for r in group.get('proxy_products', []):
                category = r.get('proxy_category', group.get('proxy_category'))
                if category not in ('lte', 'residential_static') or r.get('traffic_limitation') != -1:
                    continue
                periods = r.get('available_periods') or [{'months': 1, 'price': r.get('discounted_price') or r['price_usd']}]
                for period in periods:
                    cost = money(period['price'])
                    maximum = min(10, int(r['max_quantity'])) if r.get('max_quantity') is not None else 10
                    offers.append({'id': identifier(r['id']), 'title': r['title'], 'category': category,
                        'country': r['location_country_code'], 'period_months': int(period['months']),
                        'days': r['days'] if not r.get('available_periods') else None,
                        'max_quantity': max(0, maximum), 'available': r['stock_status'] == 'in_stock' and maximum > 0,
                        'price': str(retail(cost, category)), 'cost': str(cost), 'protocols': r['protocols'],
                        'traffic': 'unlimited', 'manual_renew_supported': r.get('is_manual_renewal_possible') is True})
        return offers

    def buy(self, offer, quantity):
        if type(quantity) is not int or not 1 <= quantity <= offer['max_quantity']:
            raise ProviderError('invalid_quantity', True)
        result = self.client.request('POST', 'proxies/shop/buy_proxies/', body=[{'id': offer['id'],
            'quantity': quantity, 'period_months': offer['period_months'], 'auto_renew': False}])
        if not isinstance(result, list) or len(result) != 1:
            raise ProviderError('unknown_purchase')
        item = result[0]
        if item.get('status') == 'canceled' and item.get('order_ids') == []:
            raise ProviderError('purchase_rejected', True)
        ids = [identifier(v) for v in item.get('order_ids', [])]
        if item.get('status') != 'in_progress' or len(ids) != quantity or len(set(ids)) != quantity:
            raise ProviderError('unknown_purchase')
        return ids

    def details(self, ids):
        allowed = set(map(identifier, ids))
        rows = self.client.rows('proxies/history/')
        found = []
        for row in rows:
            rid = identifier(row['id'])
            if rid not in allowed:
                continue
            safe = {k: row.get(k) for k in ('connection_host', 'connection_port', 'connection_login',
                'connection_password', 'public_ipaddress', 'system_status', 'expired', 'access_starts_at',
                'access_expires_at', 'geoip', 'proxy_category')}
            safe.update(id=rid, can_refresh_ip=row.get('proxy_category') == 'lte' and bool(row.get('change_ip_links')))
            found.append(safe)
        return found

    # No invented manual-renew endpoint. Auto-renew is deliberately never enabled:
    # it could debit the platform without reserving a webmaster's wallet.
