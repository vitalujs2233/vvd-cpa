from typing import List
from fastapi import APIRouter, status
from pydantic import BaseModel

# Инициализируем роутер с префиксом /notifications
router = APIRouter(prefix="/notifications", tags=["Notifications & Alerts"])


# Описываем Pydantic-модели структуры уведомлений и запроса на их прочтение
class NotificationItem(BaseModel):
    id: str
    title: str
    text: str
    time: str
    type: str  # Типы: "conversion", "payout", "system"
    is_read: bool


class MarkReadRequest(BaseModel):
    notification_ids: List[str]  # Пустой список означает "прочесть все"


# Моки системных уведомлений из макета (Раздел 7)
NOTIFICATIONS_MOCK = [
    {
        "id": "notif-1",
        "title": "Новая конверсия",
        "text": "Вы получили $1.50 по офферу Adult Dating (Hold).",
        "time": "2 мин. назад",
        "type": "conversion",
        "is_read": False
    },
    {
        "id": "notif-2",
        "title": "Выплата отправлена",
        "text": "100.00 USDT успешно переведены на ваш кошелек.",
        "time": "1 час назад",
        "type": "payout",
        "is_read": True
    },
    {
        "id": "notif-3",
        "title": "Новый оффер добавлен",
        "text": "В каталог добавлен оффер Mainstream Dating CPL.",
        "time": "3 часа назад",
        "type": "system",
        "is_read": False
    }
]


@router.get("/", response_model=List[NotificationItem])
async def get_user_notifications():
    """
    Получение списка всех системных уведомлений и алертов вебмастера.
    """
    return NOTIFICATIONS_MOCK


@router.post("/mark-read", status_code=status.HTTP_200_OK)
async def mark_notifications_as_read(payload: MarkReadRequest):
    """
    Отметка указанных уведомлений (или всех сразу) как прочитанные.
    """
    if not payload.notification_ids:
        message = "Все системные уведомления пользователя успешно отмечены как прочитанные."
    else:
        message = f"Уведомления с ID {payload.notification_ids} успешно отмечены как прочитанные."
    
    return {
        "status": "success",
        "message": message
    }
