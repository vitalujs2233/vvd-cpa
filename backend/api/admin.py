from typing import List
from fastapi import APIRouter, Query, HTTPException, status
from pydantic import BaseModel

# Инициализируем роутер с префиксом /admin
router = APIRouter(prefix="/admin", tags=["Admin Panel Operations"])


# Описываем Pydantic-модели ответов и запросов для модерации
class AdminUserResponse(BaseModel):
    id: str
    name: str
    status: str


class UserStatusRequest(BaseModel):
    is_active: bool


class PayoutApprovalRequest(BaseModel):
    is_approved: bool
    decline_reason: str = None


# Демонстрационный список вебмастеров сети из макета (Раздел 9.1), привязанный к вашему ID
ADMIN_USERS_MOCK = [
    {"id": "232682307", "name": "Виталий lv", "status": "active"},
    {"id": "12E457", "name": "Jane Smith", "status": "active"},
    {"id": "123458", "name": "Mike Johnson", "status": "active"},
    {"id": "123459", "name": "Sarah Wilson", "status": "active"}
]


@router.get("/users", response_model=List[AdminUserResponse])
async def get_all_webmasters(
    search: str = Query(None, description="Поиск вебмастера по имени или Telegram ID")
):
    """
    Получение списка всех зарегистрированных в сети вебмастеров (для раздела 9.1).
    Поддерживает фильтрацию поиска на сервере.
    """
    if not search:
        return ADMIN_USERS_MOCK
    
    # Имитируем фильтрацию поиска по имени или ID на стороне сервера
    filtered_users = [
        user for user in ADMIN_USERS_MOCK
        if search.lower() in user["name"].lower() or search.lower() in user["id"].lower()
    ]
    return filtered_users


@router.post("/users/{user_id}/status")
async def toggle_user_active_status(user_id: str, payload: UserStatusRequest):
    """
    Защищенное действие: Блокировка или Активация аккаунта вебмастера администратором.
    """
    status_text = "active" if payload.is_active else "inactive"
    return {
        "status": "success",
        "message": f"Статус аккаунта вебмастера {user_id} успешно изменен на '{status_text}'."
    }


@router.post("/payouts/{payout_id}/approve")
async def approve_payout_request(payout_id: str, payload: PayoutApprovalRequest):
    """
    Защищенное действие: Модерация и проведение выплат.
    Администратор одобряет вывод (статус «Выполнено») или отклоняет с вводом причины.
    """
    status_text = "выполнена" if payload.is_approved else "отклонена"
    return {
        "status": "success",
        "message": f"Заявка на выплату {payout_id} успешно промодерирована. Статус изменен на '{status_text}'."
    }
