"""Allowlisted mobile catalogue; no credentials or account fields leave this module."""
from fastapi import HTTPException


def normalize_tariffs(response):
    raw = response.get('tariffs') if isinstance(response, dict) else None
    if not isinstance(raw, list):
        raise HTTPException(502, 'Поставщик не вернул поддерживаемый список мобильных тарифов')
    result = []
    for tariff in raw:
        if not isinstance(tariff, dict):
            continue
        country = tariff.get('country')
        if not isinstance(country, str) or len(country) != 3 or not country.isalpha():
            continue
        operators = []
        for op in tariff.get('mobileOperator', []) if isinstance(tariff.get('mobileOperator'), list) else []:
            if not isinstance(op, dict) or not isinstance(op.get('name'), str) or not op['name'].strip():
                continue
            rotations = op.get('rotationTime')
            if not isinstance(rotations, list):
                continue
            rotations = sorted({v for v in rotations if type(v) is int and v >= 0})
            if rotations:
                operators.append({'name': op['name'], 'rotationTime': rotations})
        if operators:
            result.append({'country': country.upper(), 'mobileOperator': operators})
    if not result:
        raise HTTPException(503, 'Мобильные тарифы с операторами и ротацией сейчас недоступны у поставщика')
    return result
