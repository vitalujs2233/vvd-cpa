from fastapi import APIRouter, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

# Инициализируем роутер с префиксом /smartlinks
router = APIRouter(prefix="/smartlinks", tags=["SmartLinks"])


# Описываем Pydantic-модели запроса и ответа
class SmartLinkGenerateRequest(BaseModel):
    offer_id: str  # ID вертикали (например, "adult-dating")


class SmartLinkResponse(BaseModel):
    smartlink: str


@router.post("/generate", response_model=SmartLinkResponse, status_code=status.HTTP_201_CREATED)
async def generate_smartlink(payload: SmartLinkGenerateRequest):
    """
    Генерация индивидуального SmartLink для авторизованного вебмастера.
    Генерирует короткую ссылку и записывает её привязку в базу данных.
    """
    # На этапе скелета генерируем укороченный демонстрационный URL
    # В реальной логике суффикс (например, jgb123) будет случайно генерироваться
    suffix_mock = f"{payload.offer_id[:2].lower()}123"
    return {
        "smartlink": f"https://demo.vvdcpa.link/{suffix_mock}"
    }


@router.get("/r/{suffix}")
async def redirect_traffic(suffix: str):
    """
    Асинхронный ротатор трафика (Редиректор).
    Принимает короткую ссылку, считывает привязку к вебмастеру,
    пробрасывает его ID в параметр sub1 и перенаправляет трафик на Traforce.
    """
    # На этапе скелета демонстрируем итоговый 302-редирект на Traforce
    # В реальной логике здесь будет поиск по БД, выявление ГЕО/устройства и подстановка sub1
    target_traforce_url = "https://traforce-tracker.com/click?pid=YOUR_PID&offer_id=OFFER_ID&sub1=232682307"
    
    return RedirectResponse(
        url=target_traforce_url, 
        status_code=status.HTTP_302_FOUND
    )
