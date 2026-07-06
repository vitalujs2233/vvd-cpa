from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Импортируем глобальные настройки конфигуратора
from backend.config import settings

# Импортируем все созданные роутеры из структуры API
from backend.api import auth
from backend.api import users
from backend.api import offers
from backend.api import smartlinks
from backend.api import statistics
from backend.api import postback
from backend.api import chat
from backend.api import withdraw
from backend.api import notifications
from backend.api import admin


# Управление жизненным циклом асинхронного сервера (Lifespan)
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Действия при запуске бэкенда (например, проверка пинга базы данных)
    yield
    # Действия при остановке сервера (например, закрытие пула соединений)


# Инициализируем FastAPI с метаданными для интерактивной документации
app = FastAPI(
    title="VVD CPA API",
    version="1.0.0",
    description="Premium Affiliate Network Backend API",
    lifespan=lifespan,
    docs_url="/docs",    # Swagger UI интерактивный кабинет
    redoc_url="/redoc"   # Альтернативная документация ReDoc
)

# Разрешенные домены (CORS), которые могут отправлять запросы к нашему API.
# Добавляем ваш реальный домен GitHub Pages, чтобы браузер не блокировал запросы.
origins = [
    "https://vitalujs2233.github.io",  # Ваш фронтенд на GitHub Pages
    "http://localhost:3000",          # Локальная разработка (стандартный порт)
    "http://localhost:5173",          # Стандартный порт Vite сервера
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],  # Разрешаем все HTTP-методы (GET, POST, OPTIONS, и т.д.)
    allow_headers=["*"],  # Разрешаем все HTTP-заголовки
)

# === РЕГИСТРАЦИЯ ВСЕХ API РОУТЕРОВ ПОД ЕДИНЫМ ПРЕФИКСОМ /api/v1 ===
app.include_router(auth.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(offers.router, prefix="/api/v1")
app.include_router(smartlinks.router, prefix="/api/v1")
app.include_router(statistics.router, prefix="/api/v1")
app.include_router(postback.router, prefix="/api/v1")
app.include_router(chat.router, prefix="/api/v1")
app.include_router(withdraw.router, prefix="/api/v1")
app.include_router(notifications.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")


@app.get("/health", tags=["System"])
async def health_check():
    """
    Проверка пинга/работоспособности бэкенда (Health Check)
    """
    return {
        "status": "healthy",
        "app": "VVD CPA Backend",
        "version": "1.0.0"
    }
