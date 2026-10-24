"""Development-only provider fixtures. Never creates purchases or touches real wallets."""
from .numbers import Numbers
from .proxy import Proxy

class MockClient:
    def rows(self, path, params=None):
        if path == 'numbers/countries/':
            return [{'code': '2', 'name': 'ТЕСТ — Kazakhstan'}]
        if path == 'numbers/services/':
            return [{'code': 'example', 'name': 'ТЕСТ — Example', 'provider': 'virtual'}]
        if path == 'numbers/search/':
            return [{'id': 1, 'code': 'example', 'name': 'ТЕСТ — Example', 'country_code': '2',
                     'country_name': 'ТЕСТ — Kazakhstan', 'provider': 'virtual', 'is_active': True, 'count': '5', 'cost': '1.00'}]
        if path == 'proxies/shop/':
            return [{'access_type': 'private', 'proxy_products': [
                {'id': '11111111-1111-4111-8111-111111111111', 'title': 'ТЕСТ — Mobile',
                 'proxy_category': 'lte', 'location_country_code': 'us', 'price_usd': '2.00',
                 'days': 1, 'stock_status': 'in_stock', 'traffic_limitation': -1,
                 'max_quantity': 2, 'protocols': ['http', 'socks5'], 'available_periods': []},
                {'id': '22222222-2222-4222-8222-222222222222', 'title': 'ТЕСТ — ISP',
                 'proxy_category': 'residential_static', 'location_country_code': 'de', 'price_usd': '3.00',
                 'days': 30, 'stock_status': 'in_stock', 'traffic_limitation': -1,
                 'max_quantity': 3, 'protocols': ['socks5'],
                 'available_periods': [{'months': 1, 'price': '3.00'}, {'months': 3, 'price': '8.00'}]}]}]
        return []

    def request(self, *args, **kwargs):
        raise RuntimeError('Mock catalog cannot perform purchases')
