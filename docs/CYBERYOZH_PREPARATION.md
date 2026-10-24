# CyberYozh: подготовка номеров и прокси (24.10.2026)

## Границы изменения

Доработаны четыре существующие страницы номеров/прокси. Навигация, Card/Button,
чёрно-золотой дизайн сохранены. Нового кошелька нет. Stars, AI, CPA, главная,
рефералы, выплаты и настройки платежей не изменены.

**Это подготовка, не запущенный магазин. Реальные покупки остаются заблокированы.**
Ключ не добавлялся, к платному API поставщика запросы не выполнялись. Установка
ключа сама по себе не включает списания. HTTP POST покупки намеренно возвращает
503 до отдельного выпуска после приёмки владельцем.

## Аудит

Ранее четыре страницы были заглушками с отключёнными селекторами. Общий
`POST /tools-market/orders` уже был заблокирован; он остаётся без изменений.
В существующих `tool_wallets` есть `available`, `reserved`, `refund_debt`.
В `tool_orders` есть цена/себестоимость/поставщик, в `tool_transactions` — история.
Новый модуль использует именно эти записи. Списания по API не доступны.

## Что подготовлено

- `backend_v2/cyberyozh/client.py`: HTTPS, X-Api-Key только на сервере,
  ограниченные повторы GET; POST/PUT не повторяются, редиректы запрещены,
  ошибки не содержат тела ответа/ключа/прокси-пароля.
- `numbers.py`: страны, сервисы, сроки, поиск наличия и цены; покупка номера,
  чтение активных/исторических SMS, проверка возможностей отмены/продления.
- `proxy.py`: только private LTE и residential_static, `traffic_limitation=-1`;
  периоды и предел количества из каталога, персональные скидки учитываются.
  Заказ с `auto_renew=false`; выдача только по закреплённым локальным UUID.
- `purchase.py`: повторное получение цены и проверка подтверждённой суммы;
  серверная наценка Decimal; подготовленная оркестрация для изолированных тестов
  и будущего проверенного обработчика. В публичный маршрут не подключена.
- `orders.py`: транзакционный резерв, уникальный request_id, одноразовое право
  отправки запроса, сохранение UUID поставщика, подтверждение выдачи, списание,
  освобождение резерва/возврат только при подтверждённом результате.
  Возвращаемые средства прежде погашают существующий refund_debt.
- `routes.py`: отдельные каталоги и поиск, серверная сумма заказа, собственные
  покупки и детали, Telegram-аутентификация, ответы private/no-store.
- `mock.py`: явно обозначенный тестовый каталог только APP_ENV=development/test;
  mock не создаёт заказы и не обращается к реальному кошельку.
- `src/pages/tools/CyberYozhPanels.tsx`: зависимые селекторы, цена с сервера,
  количество/сроки, отсутствие товара, повтор загрузки, карточки своих заказов,
  SMS, срок/таймер, данные подключения и подтверждение копирования.
- `MarketplacePages.tsx`: заменено только содержимое четырёх страниц.
- `marketApi.ts`: добавлены отдельные вызовы без сохранения SMS/паролей в
  существующий persistent snapshot cache. Остальные методы оставлены прежними.
- `tools_marketplace.py`: только подключение изолированного роутера.

Отмена/продление/смена IP на публичных страницах пока не активны. Наличие
поддержки у поставщика и разрешение финансовой операции — разные проверки.
В тестовом каталоге покупать нельзя: имитация полного цикла выполняется
автотестами на отдельной тестовой БД, а не на балансах пользователей.

## Сопоставление с официальной документацией

База: https://app.cyberyozh.com/api/v1/, заголовок X-Api-Key.

| Назначение | Документированный метод |
|---|---|
| Страны / сервисы | GET numbers/countries/, numbers/services/ |
| Поиск / цена SMS | GET numbers/search/ |
| Покупка / активные номера | POST / GET numbers/ |
| История SMS | GET numbers/history/ |
| Отмена | PUT numbers/{id}/cancel/ |
| Опции / запрос продления SMS | GET numbers/{id}/extend-options/, PUT numbers/{id}/extend/ |
| Каталог прокси | GET proxies/shop/ |
| Покупка прокси | POST proxies/shop/buy_proxies/ |
| Выданные прокси | GET proxies/history/ |

Источники: https://apidoc.cyberyozh.com/docs/intro,
https://apidoc.cyberyozh.com/docs/sms-api/buy-numbers,
https://apidoc.cyberyozh.com/docs/sms-api/search,
https://apidoc.cyberyozh.com/docs/sms-api/services,
https://apidoc.cyberyozh.com/docs/sms-api/countries,
https://apidoc.cyberyozh.com/docs/proxy-api/shop,
https://apidoc.cyberyozh.com/docs/proxy-api/history,
https://apidoc.cyberyozh.com/docs/proxy-api/server-management.

### Ограничения, которые нельзя скрывать

1. Покупка прокси **не идемпотентна**. В документации нет client request ID для
   надёжного поиска результата потерянного ответа. После тайм-аута без UUID —
   `unknown`/`dispatched`, резерв остаётся. Нельзя сопоставлять по совпавшей цене
   или времени, автоматически возвращать деньги либо повторять покупку.
   Нужна ручная сверка с поддержкой поставщика до решения такого заказа.
2. Полученный UUID означает принятие заказа, не выдачу. Capture происходит
   после подтверждения номера/данных прокси. Частичная выдача прокси оставляет
   весь резерв на сверке; частичный возврат автоматически не придуман.
3. В документации есть признак ручного продления прокси, но изученные методы
   не описывают покупку такого продления. Auto-renew нельзя использовать вместо
   него: он мог бы тратить баланс владельца без резерва вебмастера.
4. Refresh-IP принимает ID proxy server; история содержит ID proxy order.
   Соответствие идентификаторов и возможность конкретного товара необходимо
   проверить. В этой версии запрос смены IP не отправляется.
5. Продление SMS асинхронное: 200 не означает, что срок увеличен. Неизменившийся
   срок сам по себе не доказывает отказ. До проверки реального результата
   публичное платное продление не подключено.
6. История SMS содержит коды; полный текст сообщения/таймер одноразовых номеров
   может отсутствовать. UI не выдумывает ни текст, ни время истечения.
7. Поставщик не принимает подтверждённый максимум цены в описанном запросе.
   Повышать уже подтверждённую розничную сумму нельзя. Возможную разницу
   себестоимости должен принять владелец либо отменить продажу до отправки.
8. Подготовленный reconciler вызывается тестами, постоянный production worker
   не запущен. Перед включением магазина нужны его расписание, мониторинг
   застрявших заказов и проверка реальных статусов. Новые сервисы не создавались.

## Миграция

`backend_v2/migrations/20261024114427_cyberyozh_order_preparation.sql`

Добавляет только:
- уникальный индекс tool_orders(id,telegram_id) для внешнего ключа владельца;
- tool_cyberyozh_orders: состояние исполнения, request_id, выбранный товар,
  точная себестоимость, связь с существующим заказом и владельцем;
- tool_cyberyozh_items: уникальные UUID поставщика, связь с локальным заказом;
- запись поставщика cyberyozh со статусом unavailable.

RLS включён, публичные/anon/authenticated права отозваны. Пароли прокси в БД
не сохраняются; выдаются сервером только владельцу известного заказа.
Миграция не меняет пользовательские балансы, Stars или существующие операции.
Старая версия приложения совместима с новой схемой; при откате кода эти
добавленные таблицы оставляют на месте, не удаляя историю.

## Маршруты VVD CPA

Все ниже требуют действительную Telegram initData:
- GET /tools-market/numbers/catalog
- GET /tools-market/numbers/search
- POST /tools-market/numbers/quote
- GET /tools-market/numbers/orders
- GET /tools-market/numbers/orders/{local_order_id}
- GET /tools-market/proxy/catalog
- POST /tools-market/proxy/quote
- GET /tools-market/proxy/orders
- GET /tools-market/proxy/orders/{local_order_id}
- POST /tools-market/{numbers|proxy}/orders — **503, выключен**.

## Переменные Render

| Переменная | Значение / назначение |
|---|---|
| CYBERYOZH_MODE | preparation (по умолчанию), mock (только разработка), live (реальный каталог, покупки всё ещё выключены) |
| CYBERYOZH_API_BASE | https://app.cyberyozh.com/api/v1/ |
| CYBERYOZH_API_KEY | секрет из CyberYozh, добавить только в Render Environment |
| CYBERYOZH_TIMEOUT_SECONDS | 15 по умолчанию, ограничение 1–30 |
| CYBERYOZH_READ_RETRIES | 1 по умолчанию, ограничение 0–2; только GET |
| CYBERYOZH_MARKUP_NUMBERS_PERCENT | процент к себестоимости номеров; задаёт владелец |
| CYBERYOZH_MARKUP_MOBILE_PERCENT | процент к себестоимости LTE; задаёт владелец |
| CYBERYOZH_MARKUP_ISP_PERCENT | процент к себестоимости ISP; задаёт владелец |
| APP_ENV | development/test необходим для mock; не устанавливать так в production |

Наценка 20 означает retail=cost×1.20. Округление единицы товара до центов
ROUND_HALF_UP, затем умножение на количество. Без заданной наценки каталог с
ценами закрывается, а не продаёт по случайной цене. Владельцу не назначен
процент по умолчанию. В реальном режиме без ключа показывается подготовка.

## Проверки

Backend: `PYTHONPATH=backend_v2 python -m unittest discover -s backend_v2/tests -p test_cyberyozh.py -v`
(только отдельная PostgreSQL БД с test/isolated в имени).
25 тестов: контракт/фильтры/наценка/количество/статусы/чужие данные/тайм-аут,
mock-покупка+SMS, повторные запросы, освобождение резерва, возврат, refund_debt,
rollback при ошибке записи, конкурентные запросы и защита от перерасхода.

UI: `node --test tests/cyberyozh-ui.cjs` с react-test-renderer@18.3.1.
4 теста: подготовительный экран, выбор номера и цена, выбор прокси/количества
и итог с сервера, ошибка и повтор загрузки. `npm run build`.

Workflow `.github/workflows/validate-cyberyozh.yml` выполняет backend на
настоящем PostgreSQL 17, React-тесты и сборку. Все ответы провайдера — mocks;
никаких сетевых покупок или реальных списаний.

## Действия после получения ключа

1. Добавить секрет и проценты наценки в Render, оставить preparation.
2. По отдельной готовности переключить mode=live и проверить **чтение**:
   реальные схемы, страны/сервисы, private/unlimited товары, цены/скидки/сроки.
3. Подтвердить с поставщиком неясные возможности выше и способ сверки потерянных
   ответов. До этого не обещать автоматическое разрешение unknown-заказов.
4. В разрешённой тестовой среде проверить исполнение и отмену/возврат, restart
   после отправки, получение SMS, привязку отдельных прокси и асинхронные статусы.
5. После отдельного разрешения владельца подключить проверенный orchestrator
   к существующему отключённому HTTP-маршруту и добавить подтверждение покупки
   с сохранением request_id, проверки баланса и фоновой сверки. Это отдельный
   выпуск включения, а не побочный эффект добавления ключа.
6. Только после этой приёмки разрешить реальные покупки. Эта подготовительная
   версия не объявляется полностью работающей интеграцией CyberYozh.

## Catalog loading correction (2026-10-24)

Production logs showed a single numbers search issuing page=43 through page=100
between 14:35:21Z and 14:37:06Z, ending in `catalog_too_large`. The old client
ignored the provider's `next` parameters and incremented a local page number.
The browser stopped waiting after 30 seconds while that loop continued. Provider
429 responses were also observed on countries/services reloads.

The client now reads next-page query parameters only after validating the exact
HTTPS origin and endpoint path, preserves selection filters, detects repeated
pages, and applies a shared 22-second operation budget across pagination/retries.
Individual HTTP phase timeouts are capped by the remaining budget; a continuously
streaming response can still exceed an HTTPX inactivity timeout, so the independent
30-second browser guard remains and always reports a human-readable retry message.

Process-local public supplier row caches: countries/services 300s, number searches
15s, proxy shop 20s; max 256 cached keys. Concurrent identical loads share a future;
failed loads are cached for 5s, never as empty successful catalogs. Keys separate
supplier credentials and selection parameters. No owned order, SMS or proxy
credential responses are cached. Cache contains supplier data only on the server;
retail markups are applied after retrieval. This cache is per process, not shared
across Render replicas. Real purchases remain hard-disabled; before enabling
purchases a fresh uncached quote/availability check is still required.

Frontend deduplicates only in-flight public catalog/search reads, keeps loaded
catalogs during refresh, and offers retry for search/quote failures. No timeout
increase, markup changes, schema changes or wallet operations are involved.

Tests cover offset pagination, filter preservation, repeated-page rejection,
foreign next URLs, operation deadline, cache expiry/single-flight/error caching,
slow React resolution, retry and friendly abort errors. These are simulated tests;
Telegram device verification and inspection of live next-page parameters remain
necessary before claiming complete real-world acceptance.
