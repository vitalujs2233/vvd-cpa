from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.config import settings


# Управление жизненным циклом асинхронного сервера (Lifespan)
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Место для инициализации процессов при старте бэкенда
    # (например, прогрев кэша Redis или проверка пинга базы данных)
    yield
    # Место для корректного завершения процессов при остановке сервера


# Инициализируем FastAPI с метаданными для авто-документации Swagger
app = FastAPI(
    title="VVD CPA API",
    version="1.0.0",
    description="Premium Affiliate Network Backend API",
    lifespan=lifespan,
    docs_url="/docs",  # Интерактивная документация Swagger
    redoc_url="/redoc"
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
    allow_methods=["*"],  // Разрешаем GET, POST, PUT, DELETE, OPTIONS
    allow_headers=["*"],  // Разрешаем передачу кастомных заголовков
)


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
