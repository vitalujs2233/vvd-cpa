import hmac
import hashlib
import json
import urllib.parse
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
import jwt
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

# Импортируем провайдер БД и модели таблиц
from backend.config import settings
from backend.database import get_db
from backend.models.users import User, UserSettings

router = APIRouter(prefix="/auth", tags=["Authentication"])


# Описываем Pydantic-модели запросов и ответов
class TelegramAuthRequest(BaseModel):
    init_data: str  # Сырая строка initData от Telegram WebApp


class UserResponse(BaseModel):
    telegram_id: int
    first_name: str
    last_name: Optional[str] = None
    username: Optional[str] = None
    photo_url: Optional[str] = None
    role: str
    status: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


def verify_telegram_init_data(init_data: str) -> Optional[dict]:
    """
    Криптографическая верификация строки initData от Telegram WebApp (HMAC-SHA256).
    Гарантирует подлинность данных пользователя. Возвращает словарь с данными 'user'.
    """
    try:
        # 1. Парсим строку initData в словарь параметров
        parsed_data = dict(urllib.parse.parse_qsl(init_data))
        
        if "hash" not in parsed_data:
            return None
            
        telegram_hash = parsed_data.pop("hash")
        
        # 2. Сортируем оставшиеся ключи по алфавиту и собираем в строку проверки
        data_check_list = [f"{key}={value}" for key, value in sorted(parsed_data.items())]
        data_check_string = "\n".join(data_check_list)
        
        # 3. Генерируем секретный ключ на основе токена нашего бота
        secret_key = hmac.new(
            b"WebAppData", 
            settings.BOT_TOKEN.encode(), 
            hashlib.sha256
        ).digest()
        
        # 4. Вычисляем итоговую хэш-подпись нашей строки данных
        calculated_hash = hmac.new(
            secret_key, 
            data_check_string.encode(), 
            hashlib.sha256
        ).hexdigest()
        
        # 5. Безопасно сверяем вычисленный хэш с хэшем из Телеграма
        if not hmac.compare_digest(calculated_hash, telegram_hash):
            return None
            
        # 6. Извлекаем и возвращаем JSON-объект пользователя 'user'
        if "user" in parsed_data:
            return json.loads(parsed_data["user"])
            
        return None
        
    except Exception as error:
        print(f"Ошибка при верификации initData: {error}")
        return None


def create_access_token(user_id: int, role: str) -> str:
    """
    Генерация асимметричного JWT-токена доступа (HS256) для сессии пользователя.
    """
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {
        "sub": str(user_id),
        "role": role,
        "exp": expire
    }
    encoded_jwt = jwt.encode(
        to_encode, 
        settings.JWT_SECRET, 
        algorithm=settings.JWT_ALGORITHM
    )
    return encoded_jwt


@router.post("/telegram", response_model=TokenResponse)
async def login_via_telegram(
    payload: TelegramAuthRequest, 
    db: AsyncSession = Depends(get_db)
):
    """
    Боевой эндпоинт авторизации.
    Принимает initData, криптографически проверяет её, находит или автоматически
    регистрирует вебмастера в Supabase и возвращает JWT-токен вместе с профилем.
    """
    # Шаг 1: Криптографическая проверка подписи Телеграма
    tg_user_data = verify_telegram_init_data(payload.init_data)
    
    # Если проверка провалилась, но включен режим DEBUG, разрешаем мок-вход (для тестов на localhost)
    if not tg_user_data:
        if settings.DEBUG:
            # Для тестов на ПК подменяем на данные Виталия из конфига
            tg_user_data = {
                "id": settings.TELEGRAM_ADMIN_ID,
                "first_name": "Виталий",
                "last_name": "lv",
                "username": "VILITOLU",
                "photo_url": ""
            }
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Неверная или устаревшая подпись авторизации Telegram."
            )

    telegram_id = tg_user_data.get("id")
    first_name = tg_user_data.get("first_name")
    last_name = tg_user_data.get("last_name")
    username = tg_user_data.get("username")
    photo_url = tg_user_data.get("photo_url")

    if not telegram_id or not first_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Неполные данные пользователя в Telegram initData."
        )

    # Шаг 2: Асинхронно ищем пользователя в базе Supabase
    user = await db.get(User, telegram_id)
    
    if not user:
        try:
            # Шаг 3: Авто-регистрация нового пользователя, если его нет в БД
            user = User(
                telegram_id=telegram_id,
                first_name=first_name,
                last_name=last_name,
                username=username,
                photo_url=photo_url,
                role="admin" if telegram_id == settings.TELEGRAM_ADMIN_ID else "user",
                status="active"
            )
            db.add(user)
            
            # Автоматически создаем для него настройки по умолчанию
            user_settings = UserSettings(
                user_id=telegram_id,
                push_enabled=True,
                email_enabled=False,
                language="Русский",
                currency="USD",
                is_2fa_enabled=True
            )
            db.add(user_settings)
            
            # Фиксируем изменения в Supabase
            await db.commit()
            await db.refresh(user)
            print(f"Новый вебмастер {first_name} (ID: {telegram_id}) успешно зарегистрирован в базе.")
            
        except Exception as error:
            await db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Ошибка при автоматической регистрации в базе данных: {error}"
            )
    else:
        # Если пользователь уже зарегистрирован, обновляем его имя/аватар при необходимости
        user.first_name = first_name
        user.last_name = last_name
        user.username = username
        user.photo_url = photo_url
        await db.commit()

    # Шаг 4: Генерируем реальный JWT-токен доступа
    token = create_access_token(user_id=user.telegram_id, role=user.role)

    # Возвращаем токен и данные пользователя фронтенду
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "telegram_id": user.telegram_id,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "username": user.username,
            "photo_url": user.photo_url,
            "role": user.role,
            "status": user.status
        }
    }
