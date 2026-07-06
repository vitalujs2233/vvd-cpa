from fastapi import APIRouter, Query
from pydantic import BaseModel

# Инициализируем роутер с префиксом /statistics
router = APIRouter(prefix="/statistics", tags=["Statistics"])


# Описываем Pydantic-модели ответов для сводки и графика
class StatsSummaryResponse(BaseModel):
    clicks: int
    clicks_trend: float
    conversions: int
    conversions_trend: float
    cr: str
    income: float
    income_trend: float
    epc: float
    epc_trend: float


class ChartDataResponse(BaseModel):
    chart_path: str
    chart_area_path: str


# База данных моков по периодам (в точности соответствует фронтенду)
STATS_DATA_MAP = {
    "today": {
        "clicks": 1234, "clicks_trend": 12.5, "conversions": 56, "conversions_trend": 8.2, "cr": "4.54%", "income": 23.45, "income_trend": 12.5, "epc": 0.10, "epc_trend": 6.1,
        "chart_path": "M 0 110 Q 50 120 100 80 T 200 110 T 300 50 T 400 30",
        "chart_area_path": "M 0 110 Q 50 120 100 80 T 200 110 T 300 50 T 400 30 L 400 150 L 0 150 Z"
    },
    "yesterday": {
        "clicks": 980, "clicks_trend": -4.2, "conversions": 42, "conversions_trend": -2.1, "cr": "4.28%", "income": 18.20, "income_trend": -5.3, "epc": 0.09, "epc_trend": -1.5,
        "chart_path": "M 0 90 Q 50 60 100 110 T 200 80 T 300 120 T 400 100",
        "chart_area_path": "M 0 90 Q 50 60 100 110 T 200 80 T 300 120 T 400 100 L 400 150 L 0 150 Z"
    },
    "7days": {
        "clicks": 8750, "clicks_trend": 14.8, "conversions": 380, "conversions_trend": 11.2, "cr": "4.34%", "income": 162.40, "income_trend": 15.1, "epc": 0.12, "epc_trend": 8.4,
        "chart_path": "M 0 120 Q 50 90 100 60 T 200 90 T 300 40 T 400 15",
        "chart_area_path": "M 0 120 Q 50 90 100 60 T 200 90 T 300 40 T 400 15 L 400 150 L 0 150 Z"
    },
    "30days": {
        "clicks": 35600, "clicks_trend": 18.9, "conversions": 1490, "conversions_trend": 15.6, "cr": "4.18%", "income": 650.10, "income_trend": 19.4, "epc": 0.11, "epc_trend": 10.2,
        "chart_path": "M 0 130 Q 50 110 100 50 T 200 70 T 300 30 T 400 10",
        "chart_area_path": "M 0 130 Q 50 110 100 50 T 200 70 T 300 30 T 400 10 L 400 150 L 0 150 Z"
    },
    "all": {
        "clicks": 120400, "clicks_trend": 22.1, "conversions": 4890, "conversions_trend": 19.8, "cr": "4.06%", "income": 2120.50, "income_trend": 24.3, "epc": 0.10, "epc_trend": 11.5,
        "chart_path": "M 0 100 Q 50 80 100 40 T 200 60 T 300 20 T 400 5",
        "chart_area_path": "M 0 100 Q 50 80 100 40 T 200 60 T 300 20 T 400 5 L 400 150 L 0 150 Z"
    }
}


@router.get("/summary", response_model=StatsSummaryResponse)
async def get_statistics_summary(
    period: str = Query("today", description="Период: today, yesterday, 7days, 30days, all")
):
    """
    Получение сводных финансовых и трафиковых метрик вебмастера за выбранный период.
    """
    data = STATS_DATA_MAP.get(period, STATS_DATA_MAP["today"])
    return StatsSummaryResponse(
        clicks=data["clicks"],
        clicks_trend=data["clicks_trend"],
        conversions=data["conversions"],
        conversions_trend=data["conversions_trend"],
        cr=data["cr"],
        income=data["income"],
        income_trend=data["income_trend"],
        epc=data["epc"],
        epc_trend=data["epc_trend"]
    )


@router.get("/chart", response_model=ChartDataResponse)
async def get_chart_data(
    period: str = Query("today", description="Период: today, yesterday, 7days, 30days, all")
):
    """
    Получение векторных координат для рендеринга SVG-графика за выбранный период.
    """
    data = STATS_DATA_MAP.get(period, STATS_DATA_MAP["today"])
    return ChartDataResponse(
        chart_path=data["chart_path"],
        chart_area_path=data["chart_area_path"]
    )
