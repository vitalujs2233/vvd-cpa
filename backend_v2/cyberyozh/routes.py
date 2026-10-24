"""Isolated authenticated routes mounted under the existing /tools-market prefix."""
import logging
from typing import Literal, Optional
from uuid import UUID
from fastapi import APIRouter, Header, HTTPException, Query, Response
from sqlalchemy import text
from pydantic import BaseModel, Field
from .purchase import quote
from database import engine
from stars_payments import require_telegram_id
from .client import Client, ProviderError, settings, READY_MESSAGE
from .numbers import Numbers
from .proxy import Proxy
from .orders import Orders, OrderError
from .mock import MockClient
from . import prepared_catalog

router = APIRouter()
logger = logging.getLogger(__name__)


def provider_failure(exc, fallback, status=503):
    code = exc.code if isinstance(exc, ProviderError) else 'invalid_response'
    # Only locally generated error codes: never log response bodies, query values or secrets.
    logger.warning('CyberYozh read failed: %s', code)
    messages = {
        'invalid_base': 'Ошибка настройки сервиса. Обратитесь в поддержку.',
        'invalid_config': 'Ошибка настройки сервиса. Обратитесь в поддержку.',
        'invalid_markup': 'Цена недоступна: требуется настройка наценки.',
        'markup_not_configured': 'Цена недоступна: требуется настройка наценки.',
        'provider_http_401': 'Поставщик временно недоступен. Обратитесь в поддержку.',
        'provider_http_403': 'Поставщик временно недоступен. Обратитесь в поддержку.',
        'invalid_price': 'Поставщик пока не предоставил корректную цену. Повторите позже.',
        'unsupported_catalog_filter': 'Поиск у поставщика временно недоступен. Повторите позже.',
        'provider_timeout': 'Поставщик не успел ответить. Повторите проверку позже.',
        'out_of_stock': 'Выбранный товар сейчас недоступен. Обновите выбор.',
        'provider_http_429': 'Слишком много запросов к поставщику. Повторите позже.',
    }
    return HTTPException(503 if code in messages else status, messages.get(code, fallback))


def adapter(category):
    cfg = settings()
    if not cfg['ready'] and not cfg['mock']:
        return None
    return (Numbers if category == 'numbers' else Proxy)(MockClient() if cfg['mock'] else Client())


def public_offer(row):
    return {k: v for k, v in row.items() if k != 'cost'}


def no_store(response):
    response.headers['Cache-Control'] = 'private, no-store'
    response.headers['Pragma'] = 'no-cache'


@router.get('/{category}/catalog')
def catalog(category: Literal['numbers', 'proxy'], response: Response,
            x_telegram_init_data: Optional[str] = Header(None)):
    require_telegram_id(x_telegram_init_data)
    no_store(response)
    cfg = settings()
    result = {'status': 'ready' if cfg['ready'] else 'preparation', 'mock': cfg['mock'],
              'purchases_enabled': False, 'message': READY_MESSAGE,
              'countries': [], 'services': [], 'periods': {}, 'offers': []}
    try:
        a = adapter(category)
        if a is None:
            return result
        if cfg['mock']:
            if category == 'numbers':
                result.update(a.catalog())
            else:
                result['offers'] = [public_offer(r) for r in a.catalog()]
        else:
            snapshot = prepared_catalog.read(category)
            if snapshot is None:
                result['status'] = 'updating'
                result['message'] = 'Обновляем предложения поставщика в фоне. Повторите через несколько секунд.'
                return result
            result.update(snapshot['catalog'])
            result['updated_at'] = snapshot['updated_at']
            result['message'] = 'Показаны сохранённые предложения. Цена и наличие уточняются отдельно.'
            return result
        if cfg['mock']:
            result['message'] = 'Тестовый каталог. Реальных покупок и списаний нет.'
        else:
            result['message'] = 'Каталог подключён. Покупки ожидают проверки и включения владельцем.'
        return result
    except (ProviderError, KeyError, TypeError, ValueError) as exc:
        raise provider_failure(exc, 'Каталог временно недоступен. Попробуйте обновить позже.') from None


@router.get('/numbers/search')
def search(response: Response, provider: str = Query(max_length=32), period: str = Query(max_length=32),
           country: str = Query(max_length=32), service: str = Query(max_length=80),
           x_telegram_init_data: Optional[str] = Header(None)):
    require_telegram_id(x_telegram_init_data)
    no_store(response)
    try:
        a = adapter('numbers')
        if a is None:
            return {'offers': [], 'message': READY_MESSAGE}
        return {'offers': [public_offer(r) for r in a.search(provider, period, country, service)]}
    except (ProviderError, KeyError, TypeError, ValueError) as exc:
        raise provider_failure(exc, 'Не удалось проверить наличие и цену.') from None


@router.post('/{category}/orders')
def purchase_disabled(category: Literal['numbers', 'proxy'], x_telegram_init_data: Optional[str] = Header(None)):
    require_telegram_id(x_telegram_init_data)
    # Explicit release gate. The tested order kernel is not exposed until supplier acceptance.
    raise HTTPException(503, READY_MESSAGE + '. Реальные покупки пока отключены.')


@router.get('/{category}/orders')
def orders(category: Literal['numbers', 'proxy'], response: Response,
           x_telegram_init_data: Optional[str] = Header(None)):
    uid = require_telegram_id(x_telegram_init_data)
    no_store(response)
    with engine.connect() as c:
        rows = c.execute(text('''SELECT o.id,o.amount,o.created_at,d.selection,d.state
            FROM tool_orders o JOIN tool_cyberyozh_orders d ON d.order_id=o.id
            WHERE o.telegram_id=:u AND o.service_id=:s ORDER BY o.created_at DESC LIMIT 100'''),
            {'u': uid, 's': category}).mappings().all()
        return {'orders': [{'id': str(r['id']), 'amount': str(r['amount']), 'created_at': r['created_at'].isoformat(),
                           'state': r['state'], 'selection': r['selection']} for r in rows]}


@router.get('/{category}/orders/{order_id}')
def detail(category: Literal['numbers', 'proxy'], order_id: UUID, response: Response,
           x_telegram_init_data: Optional[str] = Header(None)):
    uid = require_telegram_id(x_telegram_init_data)
    no_store(response)
    try:
        order = Orders(engine).owned(uid, str(order_id), category)
    except OrderError:
        raise HTTPException(404, 'Заказ не найден') from None
    # Ownership checked BEFORE accessing the shared supplier account.
    with engine.connect() as c:
        ids = [str(r[0]) for r in c.execute(text('SELECT provider_order_id FROM tool_cyberyozh_items WHERE order_id=:id'), {'id': str(order_id)})]
    try:
        a = adapter(category)
        if not ids or a is None:
            return {'items': [], 'state': order['state'], 'actions_enabled': False}
        return {'items': a.details(ids), 'state': order['state'], 'actions_enabled': False}
    except (ProviderError, KeyError, ValueError, TypeError) as exc:
        raise provider_failure(exc, 'Не удалось обновить данные заказа. Покупка повторно не отправлялась.') from None


class Selection(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    provider: str = Field(default='', max_length=32)
    period: str = Field(default='', max_length=32)
    country: str = Field(default='', max_length=32)
    service: str = Field(default='', max_length=80)
    period_months: int = Field(default=1, ge=1, le=12)
    quantity: int = Field(default=1, ge=1, le=10, strict=True)


@router.post('/{category}/quote')
def price(category: Literal['numbers', 'proxy'], selection: Selection, response: Response,
          x_telegram_init_data: Optional[str] = Header(None)):
    require_telegram_id(x_telegram_init_data)
    no_store(response)
    try:
        a = adapter(category)
        if a is None:
            raise HTTPException(503, READY_MESSAGE)
        offer, quantity, amount, _ = quote(a, category, selection.model_dump())
        return {'offer': public_offer(offer), 'quantity': quantity, 'amount': str(amount),
                'currency': 'USD', 'mock': settings()['mock'], 'purchases_enabled': False}
    except (ProviderError, KeyError, TypeError, ValueError) as exc:
        raise provider_failure(exc, 'Цена или наличие изменились. Обновите выбор.', 409) from None


_probe_started = False
_refresh_started = False

async def refresh_public_catalogs():
    import asyncio
    while True:
        if settings()['ready']:
            for category in ('numbers', 'proxy'):
                try:
                    await asyncio.to_thread(prepared_catalog.refresh, category)
                except Exception as exc:
                    code = exc.code if isinstance(exc, ProviderError) else type(exc).__name__
                    logger.warning('CyberYozh background catalog refresh failed: %s %s', category, code)
        await asyncio.sleep(180)

@router.on_event('startup')
async def optional_catalog_probe():
    global _probe_started, _refresh_started
    if not _refresh_started:
        _refresh_started = True
        import asyncio
        asyncio.create_task(refresh_public_catalogs())
    # Explicit operator opt-in; no HTTP bypass, database access or paid requests.
    import os
    if os.getenv('CYBERYOZH_CATALOG_PROBE') == '1' and settings()['ready']:
        import asyncio
        from .diagnostics import run
        asyncio.create_task(asyncio.to_thread(run))
