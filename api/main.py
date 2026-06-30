from fastapi import APIRouter, FastAPI, HTTPException, status
from fastapi.responses import RedirectResponse
from uuid import uuid4
import datetime

app = FastAPI(title="VVD CPA API")

# База данных офферов для редиректа трафика (замени ссылки на свои реальные из Traforce)
OFFERS_DB = {
    1: "https://traforce-link.com",
    2: "https://traforce-link.com"
}

# 1. ОБРАБОТКА КЛИКА И МГНОВЕННЫЙ РЕДИРЕКТ НА TRAFORCE
@app.get("/click")
async def handle_click(user_id: int, offer_id: int):
    # Проверяем, существует ли оффер
    if offer_id not in OFFERS_DB:
        raise HTTPException(status_code=404, detail="Offer not found")
    
    # Генерируем уникальный click_id (UUID) по ТЗ для трекинга SubID
    click_id = str(uuid4())
    
    # В будущем тут будет реальная запись клика в PostgreSQL:
    # INSERT INTO clicks (click_id, user_id, offer_id) VALUES (...)
    print(f"[CLICK] Вебмастер: {user_id} | Оффер: {offer_id} | ClickID: {click_id}")
    
    # Формируем ссылку на Traforce и пробрасываем наш click_id в параметр subid1
    base_url = OFFERS_DB[offer_id]
    target_url = f"{base_url}?subid1={click_id}"
    
    # Мгновенный 302 Редирект трафика
    return RedirectResponse(url=target_url, status_code=status.HTTP_302_FOUND)


# 2. ПРИЕМ POSTBACK ОТ TRAFORCE (РАСПРЕДЕЛЕНИЕ ДОХОДА 20 / 80 И ХОЛД 10 ДНЕЙ)
@app.get("/postback")
async def receive_postback(subid1: str, payout: float, status: str):
    """
    Формат запроса: https://твой-домен.ком/postback?subid1=click_id&payout=1.00&status=approved
    """
    if status != "approved":
        return {"status": "ignored", "message": "Only approved leads are processed"}
        
    # Расчет комиссии по ТЗ: 20% админу, 80% вебмастеру
    admin_share = round(payout * 0.20, 4)
    webmaster_share = round(payout * 0.80, 4)
    
    # Расчет даты разморозки (Срок холда — 10 дней по ТЗ)
    hold_until_date = datetime.date.today() + datetime.timedelta(days=10)
    
    # В будущем тут будет реальный поиск click_id в базе данных для определения user_id
    # И обновление балансов в PostgreSQL:
    # UPDATE users SET balance_hold = balance_hold + webmaster_share WHERE tg_id = user_id
    # UPDATE admin_finances SET balance = balance + admin_share
    
    print(f"[POSTBACK] Успех! Админу: ${admin_share} | Вебмастеру в холд: ${webmaster_share} до {hold_until_date}")
    
    return {
        "status": "success",
        "click_id": subid1,
        "payout_total": payout,
        "webmaster_payout_hold": webmaster_share,
        "admin_payout_available": admin_share,
        "hold_until": str(hold_until_date)
    }
