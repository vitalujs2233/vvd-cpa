"""Production admission for ordinary proxy checkout.

All four proxy types share the existing global purchase switch. For IPv4,
ISP and Mobile the supplier does not return proxy IDs per order, so fulfillment
still uses the exclusive-account inventory review and never blindly assigns IDs.
"""
import os

INVENTORY_TYPES = ('ipv4', 'isp', 'mobile')

def authority(kind):
    if kind not in INVENTORY_TYPES:
        return None
    if os.getenv('PROXY_IPV4_PURCHASES_ENABLED', 'false').lower() != 'true':
        return None
    return {'mode': 'production', 'proxy_type': kind, 'exclusive_account': True}

def enabled_types():
    return tuple(kind for kind in INVENTORY_TYPES if authority(kind))

def saved_authority(order):
    value = order.get('fulfillment_authority')
    if (isinstance(value, dict) and value.get('mode') == 'production'
            and value.get('exclusive_account') is True
            and value.get('proxy_type') == order['proxy_type']
            and order['proxy_type'] in INVENTORY_TYPES):
        return value
    return None
