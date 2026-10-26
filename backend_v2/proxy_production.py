"""Server-side production admission; absent acceptance keeps new types disabled.

These settings are deployment approvals, never client request parameters. The
accepted policy is persisted with submission so pausing sales cannot strand goods.
"""
import os
import re

INVENTORY_TYPES = ('ipv4', 'isp', 'mobile')

def authority(kind):
    configured = {v.strip() for v in os.getenv('PROXY_IPV4_PRODUCTION_TYPES', '').split(',') if v.strip()}
    reference = os.getenv('PROXY_IPV4_FINANCIAL_ACCEPTANCE_REF', '').strip()
    if (kind not in INVENTORY_TYPES or kind not in configured or not configured.issubset(INVENTORY_TYPES)
            or os.getenv('PROXY_IPV4_PURCHASES_ENABLED', 'false').lower() != 'true'
            or os.getenv('PROXY_IPV4_EXCLUSIVE_ACCOUNT_CONFIRMED', 'false').lower() != 'true'
            or not re.fullmatch(r'[A-Za-z0-9_.:/#-]{3,120}', reference)):
        return None
    return {'mode':'production', 'proxy_type':kind, 'exclusive_account':True,
            'financial_acceptance_ref':reference}

def enabled_types():
    return tuple(kind for kind in INVENTORY_TYPES if authority(kind))

def saved_authority(order):
    value=order.get('fulfillment_authority')
    if (isinstance(value,dict) and value.get('mode')=='production'
            and value.get('exclusive_account') is True
            and value.get('proxy_type')==order['proxy_type']
            and order['proxy_type'] in INVENTORY_TYPES
            and isinstance(value.get('financial_acceptance_ref'),str)
            and re.fullmatch(r'[A-Za-z0-9_.:/#-]{3,120}',value['financial_acceptance_ref'])):
        return value
    return None
