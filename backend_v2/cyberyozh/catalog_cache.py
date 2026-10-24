"""Bounded process-local cache for supplier catalog rows only, never owned orders/SMS."""
from collections import OrderedDict
from concurrent.futures import Future, TimeoutError
from copy import deepcopy
from threading import Lock
from time import monotonic

class CatalogCache:
    def __init__(self):
        self.lock = Lock()
        self.values = OrderedDict()
        self.pending = {}

    def get(self, key, load, ttl, timeout):
        from .client import ProviderError
        with self.lock:
            cached = self.values.get(key)
            if cached and cached[0] > monotonic():
                if cached[2]:
                    raise ProviderError(cached[1])
                return deepcopy(cached[1])
            future = self.pending.get(key)
            owner = future is None
            if owner:
                future = self.pending[key] = Future()
        if not owner:
            try:
                return deepcopy(future.result(timeout=max(.01, timeout)))
            except TimeoutError:
                raise ProviderError('provider_timeout') from None
        try:
            value = load()
            with self.lock:
                self.values[key] = (monotonic() + ttl, deepcopy(value), False)
            future.set_result(value)
            return deepcopy(value)
        except ProviderError as exc:
            # Short negative cache prevents a retry storm; never caches a partial catalog.
            with self.lock:
                self.values[key] = (monotonic() + 5, exc.code, True)
            future.set_exception(exc)
            raise
        except Exception as exc:
            future.set_exception(exc)
            raise
        finally:
            with self.lock:
                self.pending.pop(key, None)
                while len(self.values) > 256:
                    self.values.popitem(last=False)

catalog_cache = CatalogCache()
