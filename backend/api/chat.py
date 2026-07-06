import re
from typing import List, Dict
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

# Инициализируем роутер с префиксом /chat
router = APIRouter(prefix="/chat", tags=["Dvizh Community Chat"])


# Описываем Pydantic-модели запросов и ответов
class MessageResponse(BaseModel):
    id: str
    sender_id: str
    sender_name: str
    avatar_text: str
    text: str
    time: str
    reactions: Dict[str, int]
    is_staff: bool = False


class SendMessageRequest(BaseModel):
    text: str


class ReactionRequest(BaseModel):
    emoji: str


# Демонстрационные данные сообщений из макета для скелета
INITIAL_MESSAGES = [
    {
        "id": "msg-1",
        "sender_id": "admin",
        "sender_name": "VVD CPA Admin",
        "avatar_text": "AD",
        "text": "Приветствуем всех в приватном комьюнити VVD CPA! Здесь вы можете общаться, делиться связками и опытом. Спам и внешние ссылки строго запрещены модерацией.",
        "time": "12:00",
        "reactions": {"🚀": 12, "😎": 8, "👍": 15},
        "is_staff": True,
    },
    {
        "id": "msg-2",
        "sender_id": "user-1",
        "sender_name": "Артур_CPA",
        "avatar_text": "АР",
        "text": "Привет народ! Кто льет на дейтинг, какое ГЕО сейчас лучше всего конвертит на мобильном трафике?",
        "time": "12:35",
        "reactions": {"👍": 4, "🔥": 2},
    }
]

# Регулярное выражение (Regex) для строгого поиска ссылок и блокировки спама (Анти-спам V2.0)
LINK_REGEX = re.compile(
    r"(https?://|t\.me|telegram\.me|bit\.ly|tinyurl|cutt\.ly|vk\.com|instagram|facebook|youtube|discord|[a-zA-Z0-9-]+\.[a-zA-Z]{2,})",
    re.IGNORECASE
)


@router.get("/messages", response_model=List[MessageResponse])
async def get_chat_messages():
    """
    Получение списка последних сообщений сообщества «Движ».
    """
    return INITIAL_MESSAGES


@router.post("/messages", response_model=MessageResponse)
async def send_chat_message(payload: SendMessageRequest):
    """
    Отправка нового сообщения в общий чат «Движ».
    Автоматически валидирует текст и намертво блокирует любые внешние ссылки и домены.
    """
    # Анти-спам валидация: ищем запрещенные ссылки в тексте сообщения
    if LINK_REGEX.search(payload.text):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Отправка ссылок запрещена правилами VVD CPA."
        )
    
    # На этапе скелета возвращаем успешно добавленное вами (админом) сообщение
    return {
        "id": "msg-user-new",
        "sender_id": "232682307",
        "sender_name": "Виталий lv",
        "avatar_text": "ВИ",
        "text": payload.text,
        "time": "13:20",
        "reactions": {},
        "is_staff": True
    }


@router.post("/messages/{message_id}/react")
async def react_to_message(message_id: str, payload: ReactionRequest):
    """
    Добавление или инкремент смайлика-реакции (👍, ❤️, 🔥, 😂, 😎, 🚀) к конкретному сообщению.
    """
    allowed_emojis = ["👍", "❤️", "🔥", "😂", "😎", "🚀"]
    if payload.emoji not in allowed_emojis:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Эмодзи {payload.emoji} не поддерживается для реакций."
        )
    
    # Возвращаем статус успеха
    return {
        "status": "success",
        "message": f"Реакция {payload.emoji} успешно добавлена к сообщению {message_id}"
    }
