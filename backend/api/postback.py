from fastapi import APIRouter, Query, status
from backend.config import settings

# Инициализируем роутер с префиксом /postback
router = APIRouter(prefix="/postback", tags=["Postbacks & Webhooks"])


@router.get("/receiver", status_code=status.HTTP_200_OK)
async def receive_postback(
    click_id: str = Query(..., description="Уникальный ID клика в системе Traforce"),
    offer_id: str = Query(..., description="ID оффера/вертикали в системе Traforce"),
    status: str = Query(..., description="Статус конверсии: pending (холд), approved (одобрено), declined (отклонено)"),
    payout: float = Query(..., description="Грязная сумма выплаты от Traforce в USD"),
    sub1: int = Query(..., description="ID вебмастера в нашей системе VVD CPA (Telegram ID)")
):
    """
    Приемник Postback-вебхуков от родительской CPA-сети Traforce.
    Считывает конверсию, рассчитывает чистую выплату вебмастеру за вычетом комиссии платформы,
    зачисляет средства на его баланс и триггерит push-уведомление в Telegram.
    """
    # Считываем процент комиссии из глобального конфигуратора config.py
    commission_percentage = settings.COMMISSION_RATE
    
    # Вычисляем чистый доход вебмастера (например, от $2.00 отнимаем 15% комиссии = $1.70)
    net_payout = payout * (1.0 - commission_percentage)
    
    # Вычисляем чистую прибыль нашей платформы с этой конверсии ($0.30)
    platform_profit = payout * commission_percentage

    # На этапе скелета возвращаем отчет об успешном приеме и раскладку расчетов
    return {
        "status": "success",
        "message": "Postback processed successfully",
        "raw_payload": {
            "click_id": click_id,
            "offer_id": offer_id,
            "status": status,
            "payout_gross": payout,
            "webmaster_id": sub1
        },
        "processed_attribution": {
            "payout_net": round(net_payout, 4),        # Сумма к зачислению вебмастеру
            "platform_profit": round(platform_profit, 4) # Доход владельца VVD CPA
        }
    }
