from typing import List
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

# Инициализируем роутер с префиксом /withdraw
router = APIRouter(prefix="/withdraw", tags=["Withdrawals & Payouts"])


# Описываем Pydantic-модели запросов и ответов
class PayoutRequest(BaseModel):
    amount: float
    wallet: str  # Адрес USDT TRC20


class PayoutResponse(BaseModel):
    status: str
    message: str
    tx_id: str


class PayoutHistoryItem(BaseModel):
    id: str
    amount: float
    method: str
    address: str
    tx_id: str
    date: str
    status: str


# Моки истории финансовых транзакций вебмастера из макета (Раздел 6.1)
TRANSACTIONS_MOCK = [
    {
        "id": "tx-1", 
        "amount": 100.00, 
        "method": "USDT TRC20", 
        "address": "TQDwtZe8F2Jz9nttz2W11m78abc901234", 
        "tx_id": "0x123f99f1a23e5e78", 
        "date": "25.05.2024 12:30", 
        "status": "completed"
    },
    {
        "id": "tx-2", 
        "amount": 200.00, 
        "method": "USDT TRC20", 
        "address": "TQDwtZe8F2Jz9nttz2W11m78abc901234", 
        "tx_id": "0x456da2b41a238b99", 
        "date": "18.05.2024 18:10", 
        "status": "completed"
    },
    {
        "id": "tx-3", 
        "amount": 150.00, 
        "method": "USDT TRC20", 
        "address": "TQDwtZe8F2Jz9nttz2W11m78abc901234", 
        "tx_id": "0x789cb4f1a23e1a23", 
        "date": "10.05.2024 15:45", 
        "status": "completed"
    },
    {
        "id": "tx-4", 
        "amount": 50.00, 
        "method": "USDT TRC20", 
        "address": "TQDwtZe8F2Jz9nttz2W11m78abc901234", 
        "tx_id": "—", 
        "date": "03.05.2024 09:15", 
        "status": "declined"
    }
]


@router.get("/history", response_model=List[PayoutHistoryItem])
async def get_payout_history():
    """
    Получение истории всех финансовых выплат вебмастера.
    """
    return TRANSACTIONS_MOCK


@router.post("/request", response_model=PayoutResponse)
async def request_payout(payload: PayoutRequest):
    """
    Подача заявки на вывод финансовых средств.
    Проверяет лимиты суммы и формат TRC20 адреса кошелька на стороне сервера.
    """
    # Серверная валидация минимального лимита
    if payload.amount < 10.0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Минимальная сумма вывода составляет $10"
        )
    
    # Серверная валидация формата USDT TRC20 (обязательная буква T и длина не менее 30 символов)
    if not payload.wallet.startswith("T") or len(payload.wallet) < 30:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Укажите корректный адрес USDT TRC20 (начинается с T)"
        )
    
    # Имитируем успешную генерацию транзакции и списание
    return {
        "status": "success",
        "message": "Заявка на вывод средств успешно создана и передана в финансовый отдел на обработку.",
        "tx_id": "0xnew_tx_id_generated_hash_placeholder"
    }
