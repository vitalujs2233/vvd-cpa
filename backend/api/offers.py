from typing import List
from fastapi import APIRouter
from pydantic import BaseModel

# Инициализируем роутер с префиксом /offers
router = APIRouter(prefix="/offers", tags=["Offers"])


# Описываем Pydantic-модели для каталога и карточки деталей оффера
class OfferCategoryResponse(BaseModel):
    id: str
    title: str
    offers_count: int
    icon_name: str
    is_top: bool
    is_new: bool


class OfferDetailResponse(BaseModel):
    id: str
    title: str
    geo: str
    hold: str
    payout: str
    description: str
    allowed_traffic: List[str]
    forbidden_traffic: List[str]


# Демонстрационные данные категорий из макета для скелета
OFFERS_MOCK = [
    {"id": "adult-dating", "title": "Adult Dating", "offers_count": 120, "icon_name": "heart", "is_top": True, "is_new": False},
    {"id": "mainstream-dating", "title": "Mainstream Dating", "offers_count": 95, "icon_name": "sparkles", "is_top": False, "is_new": True},
    {"id": "nutra", "title": "Nutra", "offers_count": 80, "icon_name": "pill", "is_top": True, "is_new": False},
    {"id": "crypto", "title": "Crypto", "offers_count": 65, "icon_name": "coins", "is_top": True, "is_new": False},
    {"id": "gaming", "title": "Gaming", "offers_count": 50, "icon_name": "gamepad", "is_top": False, "is_new": True},
    {"id": "utilities", "title": "Utilities", "offers_count": 40, "icon_name": "smartphone", "is_top": False, "is_new": False},
]

# Демонстрационные детальные условия по макетам (2.1 - 2.7)
OFFERS_DETAILS_MAP = {
    "adult-dating": {
        "id": "adult-dating",
        "title": "Adult Dating",
        "geo": "Worldwide",
        "hold": "10 дней",
        "payout": "$0.10 - $50",
        "description": "Лучшие офферы в категории Adult Dating. Высокий конверт на мобильном трафике с фокусом на CPL-модели (регистрации).",
        "allowed_traffic": ["Social Media", "Content Ads", "Native Ads"],
        "forbidden_traffic": ["Incentive Traffic", "Fraud / Bot", "Motivated traffic"]
    },
    "crypto": {
        "id": "crypto",
        "title": "Crypto",
        "geo": "Worldwide",
        "hold": "10 дней",
        "payout": "$10 - $950",
        "description": "Премиальные офферы крипто-брокеров и крипто-роботов. Максимальные выплаты по CPA за первый депозит пользователя.",
        "allowed_traffic": ["Search Ads (PPC)", "SEO Traffic", "Native Ads"],
        "forbidden_traffic": ["Incentive Traffic", "In-App Spam", "Fraud / Motivated"]
    }
}


@router.get("/", response_model=List[OfferCategoryResponse])
async def get_all_offer_categories():
    """
    Получение списка всех доступных категорий офферов (вертикалей).
    """
    return OFFERS_MOCK


@router.get("/{offer_id}", response_model=OfferDetailResponse)
async def get_offer_category_details(offer_id: str):
    """
    Получение детальных условий (ГЕО, Холд, Выплаты, Правила) конкретной вертикали.
    """
    details = OFFERS_DETAILS_MAP.get(offer_id)
    if not details:
        # Если детальных моков под конкретный ID нет, возвращаем Adult Dating по умолчанию
        default_data = OFFERS_DETAILS_MAP["adult-dating"].copy()
        default_data["id"] = offer_id
        default_data["title"] = offer_id.replace("-", " ").title()
        return default_data
    return details
  
