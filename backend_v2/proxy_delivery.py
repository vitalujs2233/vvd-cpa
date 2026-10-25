"""Read-only, fail-closed projection of supplier data for an owned order."""
import ipaddress


def linked_items(items, kind, order_number):
    if not isinstance(items, list) or not order_number:
        return []
    result = []
    for item in items:
        if not isinstance(item, dict):
            continue
        refs = [str(item[k]) for k in ('orderId', 'orderNumber') if item.get(k) is not None]
        if not refs or any(ref != str(order_number) for ref in refs):
            continue
        if kind == 'ipv6':
            children = item.get('ips', [])
            if isinstance(children, list):
                result.extend(p for p in children if isinstance(p, dict) and
                              all(str(p[k]) == str(order_number) for k in ('orderId', 'orderNumber') if p.get(k) is not None))
        else:
            result.append(item)
    return result


def connection_data(items):
    result, seen = [], set()
    for item in items:
        ident, address = item.get('id'), item.get('ip')
        if not isinstance(ident, (str, int)) or isinstance(ident, bool) or not str(ident) or str(ident) in seen:
            continue
        if not isinstance(address, str):
            continue
        host, embedded_port = address, None
        # Documented IPv6 product returns an IPv4 gateway with an embedded port.
        if address.count(':') == 1:
            host, embedded_port = address.rsplit(':', 1)
        elif address.startswith('[') and ']:' in address:
            host, embedded_port = address[1:].split(']:', 1)
        try:
            ipaddress.ip_address(host)
        except ValueError:
            continue
        endpoints = []
        for protocol, port in [('HTTPS', item.get('httpsPort')), ('SOCKS5', item.get('socks5Port')),
                               (item.get('protocol'), embedded_port)]:
            if protocol not in ('HTTP', 'HTTPS', 'SOCKS5') or isinstance(port, bool):
                continue
            if isinstance(port, (str, int)) and str(port).isdigit() and 1 <= int(port) <= 65535:
                endpoint = {'protocol': protocol, 'port': str(port)}
                if endpoint not in endpoints:
                    endpoints.append(endpoint)
        if not endpoints:
            continue
        seen.add(str(ident))
        clean = {'id': str(ident), 'host': host, 'endpoints': endpoints}
        auth = item.get('authInfo')
        if isinstance(auth, dict):
            for key in ('login', 'password'):
                if isinstance(auth.get(key), str) and auth[key]:
                    clean[key] = auth[key]
        if ('login' in clean) != ('password' in clean):
            continue  # Incomplete credentials are not a complete connection.
        for source, target in [('dateEnd', 'expires_at'), ('mobileOperator', 'mobile_operator')]:
            if isinstance(item.get(source), str):
                clean[target] = item[source]
        rotation = item.get('rotationTime')
        if isinstance(rotation, int) and not isinstance(rotation, bool) and rotation >= 0:
            clean['rotation_minutes'] = rotation
        # No raw supplier metadata, account secrets, or reboot URLs in customer JSON.
        result.append(clean)
    return result
