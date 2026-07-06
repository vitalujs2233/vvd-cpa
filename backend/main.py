# Добавили импорт стандартной асинхронной библиотеки
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Импортируем глобальные настройки конфигуратора
from backend.config import settings
print("=" * 80)
print("DATABASE_URL =", settings.DATABASE_URL)
print("=" * 80)

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

# Импортируем инстансы бота и диспетчера для фонового запуска
from backend.bot import bot, dp


# Асинхронное управление жизненным циклом сервера (Lifespan)
@asynccontextmanager
async def lifespan(app: FastAPI):
    # === ИНТЕГРАЦИЯ БОТА ===
    # Запускаем поллинг Telegram-бота в качестве фоновой асинхронной задачи в цикле событий FastAPI
    loop = asyncio.get_event_loop()
    bot_task = loop.create_task(dp.start_polling(bot))
    print("=== Telegram-бот VVD CPA успешно запущен в фоновом режиме вместе с FastAPI ===")
    
    yield
    
    # Действия при остановке сервера: корректно закрываем сессию бота и отменяем задачу
    await bot.session.close()
    bot_task.cancel()
    print("=== Работа сервера и бота корректно завершена ===")


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
