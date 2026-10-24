"""Server-side quote / orchestration, live write route intentionally remains disabled."""
from decimal import Decimal
from .client import ProviderError, money
from .orders import Orders


def quote(adapter, category, selection):
    if category == 'numbers':
        quantity = 1
        rows = adapter.search(selection['provider'], selection['period'], selection['country'], selection['service'])
        rows = [r for r in rows if r['id'] == selection['id']]
    elif category == 'proxy':
        quantity = selection.get('quantity', 1)
        rows = [r for r in adapter.catalog() if r['id'] == selection['id'] and r['period_months'] == selection['period_months']]
        # Distinguish per-day variants sharing the same product ID and month period.
        if selection.get('days') is not None:
            rows = [r for r in rows if r.get('days') == selection['days']]
        if selection.get('price') is not None:
            rows = [r for r in rows if str(r['price']) == str(selection['price'])]
    else:
        raise ProviderError('invalid_category', True)
    if len(rows) != 1 or not rows[0]['available']:
        raise ProviderError('out_of_stock', True)
    offer = rows[0]
    if type(quantity) is not int or not 1 <= quantity <= (offer.get('max_quantity', 1)):
        raise ProviderError('invalid_quantity', True)
    return offer, quantity, money(offer['price']) * quantity, money(offer['cost']) * quantity


def purchase_for_test_or_reviewed_worker(engine, uid, request_id, category, selection, expected, adapter):
    """Not an HTTP endpoint. Caller supplies a reviewed adapter; tests use fakes only."""
    offer, qty, amount, cost = quote(adapter, category, selection)
    if amount != money(expected):
        raise ProviderError('price_changed', True)
    public = {k: v for k, v in offer.items() if k != 'cost'}
    public['quantity'] = qty
    orders = Orders(engine)
    oid, created = orders.reserve(uid, request_id, category, public, cost, amount, expected)
    if created:
        orders.dispatch(uid, oid, lambda: adapter.buy(offer) if category == 'numbers' else adapter.buy(offer, qty))
    # On replay do not dispatch again. Reconciliation only reads the supplier.
    orders.reconcile(uid, oid, adapter)
    return orders.owned(uid, oid)
