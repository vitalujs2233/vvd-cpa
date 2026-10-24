"""SMS adapter: https://apidoc.cyberyozh.com/docs/sms-api/buy-numbers"""
from uuid import UUID
from .client import ProviderError, money, retail

PERIODS = {'virtual': ['MIN_15'], 'virtual_rent': ['HOUR_4', 'HOUR_12', 'DAY', 'DAY_3', 'WEEK'],
           'residential': ['MIN_15'], 'residential_rent': ['DAY_3', 'WEEK', 'WEEK_2', 'DAY_25']}


def identifier(value):
    try:
        return str(UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        raise ProviderError('invalid_order_id') from None


class Numbers:
    def __init__(self, client):
        self.client = client

    def catalog(self):
        countries = self.client.rows('numbers/countries/')
        services = self.client.rows('numbers/services/')
        return {'countries': [{'code': str(r['code']), 'name': r['name']} for r in countries],
                'services': [{'code': r['code'], 'name': r['name'], 'provider': r['provider']}
                             for r in services if r.get('provider') in PERIODS], 'periods': PERIODS}

    def search(self, provider, period, country, service):
        if period not in PERIODS.get(provider, []):
            raise ProviderError('invalid_period')
        # Live API uses country_code and returns service_code/service_name/price.
        # Service filtering is local: the live endpoint ignores service_code.
        # Cache this bounded country/provider/period read across service selections.
        rows = self.client.rows('numbers/search/', {'provider': provider, 'period': period,
                                                    'country_code': country})
        offers = []
        for r in rows:
            if str(r.get('country_code')) != country or r.get('service_code', r.get('code')) != service or r.get('provider') != provider or r.get('period') not in (None, period):
                continue
            cost = money(r.get('price', r.get('cost')))
            available = r.get('is_active') is True and str(r.get('count', '0')) not in ('0', '', 'None')
            offers.append({'id': str(r.get('id') or f'{provider}:{period}:{country}:{service}'), 'country': country, 'country_name': r.get('country_name', country),
                           'service': service, 'title': r.get('service_name', r.get('name', service)), 'provider': provider, 'period': period,
                           'available': available, 'stock': str(r.get('count', '0')), 'cost': str(cost),
                           'price': str(retail(cost, 'numbers'))})
        return offers

    def buy(self, offer):
        data = self.client.request('POST', 'numbers/', body={'provider': offer['provider'],
            'period': offer['period'], 'service_code': offer['service'], 'country_code': offer['country'],
            'need_fraud_score': False, 'markup_percent': 0})
        return [identifier(data['id'])]

    def details(self, ids):
        allowed = set(map(identifier, ids))
        rows = self.client.rows('numbers/') + self.client.rows('numbers/history/')
        found = {}
        for row in rows:
            rid = identifier(row['id'])
            if rid in allowed:
                found[rid] = {k: row.get(k) for k in ('status', 'phone_number', 'expiration_time',
                    'history_sms_code', 'can_cancel', 'can_extend', 'provider')}
                found[rid]['id'] = rid
        return list(found.values())

    def cancel(self, owned_id):
        rid = identifier(owned_id)
        rows = self.details([rid])
        if not rows or rows[0].get('can_cancel') is not True:
            raise ProviderError('cancel_not_allowed', True)
        return self.client.request('PUT', f'numbers/{rid}/cancel/')

    def extension_options(self, owned_id):
        rid = identifier(owned_id)
        rows = self.details([rid])
        if not rows or rows[0].get('can_extend') is not True:
            return []
        data = self.client.request('GET', f'numbers/{rid}/extend-options/')
        return [{'period': r['period'], 'label': r['label'], 'cost': str(money(r['price'])),
                 'price': str(retail(r['price'], 'numbers'))} for r in data['options']]

    def extend(self, owned_id, period):
        # Caller must reserve funds and reconcile expiration; a 200 is acceptance, not completion.
        options = self.extension_options(owned_id)
        if period not in [r['period'] for r in options]:
            raise ProviderError('extend_not_allowed', True)
        return self.client.request('PUT', f'numbers/{identifier(owned_id)}/extend/', body={'period': period})
