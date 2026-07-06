from fastapi import APIRouter, Depends
from pydantic import BaseModel

# Инициализируем роутер с префиксом /users
router = APIRouter(prefix="/users", tags=["Users"])


# Описываем Pydantic-модели для проверки структуры данных
class UserBalanceResponse(BaseModel):
    balance: float
    hold: float
    withdrawn: float


class UserProfileUpdate(BaseModel):
    first_name: str
    username: str
    email: str


@router.get("/balance", response_model=UserBalanceResponse)
async def get_user_balance():
    """
    Получение финансовой сводки пользователя (баланс, холд, выплачено) для дашборда.
    """
    # На этапе скелета возвращаем точные цифры из вашего дизайн-макета
    return {
        "balance": 154.50,
        "hold": 32.40,
        "withdrawn": 1234.50
    }


@router.put("/profile")
async def update_user_profile(payload: UserProfileUpdate):
    """
    Обновление полей профиля (имени, юзернейма, почты) из настроек кабинета.
    """
    # На этапе скелета возвращаем статус успеха и переданные данные
    return {
        "status": "success",
        "message": "Профиль успешно обновлен",
        "updated_data": {
            "first_name": payload.first_name,
            "username": payload.username,
            "email": payload.email
        }
    }
