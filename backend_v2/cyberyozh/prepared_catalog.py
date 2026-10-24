"""Process-local public catalog snapshots, refreshed in the background.

Contains only provider public offers/countries/services. Never store wallet,
orders, SMS or proxy access credentials. Failed refresh keeps last good data.
"""
from copy import deepcopy
from datetime import datetime, timezone
from threading import Lock

_lock = Lock()
_entries = {}


def save(category, catalog):
    with _lock:
        _entries[category] = {
            'catalog': deepcopy(catalog),
            'updated_at': datetime.now(timezone.utc).isoformat(),
        }


def read(category):
    with _lock:
        item = _entries.get(category)
        return deepcopy(item) if item is not None else None


def refresh(category):
    from .client import Client
    from .numbers import Numbers
    from .proxy import Proxy
    adapter = Numbers(Client()) if category == 'numbers' else Proxy(Client())
    catalog = adapter.catalog() if category == 'numbers' else {
        'offers': [{k: v for k, v in offer.items() if k != 'cost'}
                   for offer in adapter.catalog()]
    }
    save(category, catalog)
