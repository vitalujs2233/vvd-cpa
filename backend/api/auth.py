from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

# Инициализируем роутер с префиксом /auth
router = APIRouter(prefix="/auth", tags=["Authentication"])


# Описываем Pydantic-модели для входящих и исходящих запросов
class TelegramAuthRequest(BaseModel):
    init_data: str  # Сырая строка initData от Telegram WebApp (initDataUnsafe.user)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post("/telegram", response_model=TokenResponse)
async def login_via_telegram(payload: TelegramAuthRequest):
    """
    Аутентификация вебмастера через Telegram WebApp (initData).
    Принимает строку initData, валидирует хеш на бэкенде и возвращает JWT-токен.
    """
    # На этапе скелета возвращаем заглушку токена
    return {
        "access_token": "mock_jwt_access_token_payload",
        "token_type": "bearer"
    }


@router.get("/me")
async def get_current_user_profile():
    """
    Получение профиля текущего авторизованного пользователя.
    Защищенный эндпоинт, требующий JWT-токен в заголовке Authorization.
    """
    # На этапе скелета возвращаем демонстрационный профиль Виталия
    return {
        "id": 232682307,
        "first_name": "Виталий",
        "last_name": "lv",
        "username": "VILITOLU",
        "role": "admin",
        "status": "active"
    }
