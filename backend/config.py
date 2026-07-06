from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Настройки запуска сервера FastAPI
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    DEBUG: bool = False

    # Параметры безопасности и JWT-сессий
    JWT_SECRET: str = "vvd_cpa_super_secret_jwt_key_change_me_in_production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # Время жизни сессии - 24 часа

    # Подключение к базе данных PostgreSQL (асинхронный драйвер asyncpg)
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/vvd_cpa"

    # Интеграция с Telegram Bot API
    BOT_TOKEN: str = "123456789:AABBCCDDEEFFGGHHIIJJKKLLMMNN"
    TELEGRAM_ADMIN_ID: int = 232682307  # Ваш жестко привязанный ID администратора

    # Интеграция с API партнерской сети Traforce Affiliate
    TRAFORCE_API_KEY: str = "traforce_api_key_placeholder"
    TRAFORCE_API_URL: str = "https://api.traforce-affiliate.com/v1"

    # Внутренняя скрытая комиссия платформы VVD CPA (15% по умолчанию)
    COMMISSION_RATE: float = 0.15

    # Указываем считывать переменные из локального файла .env в приоритете
    model_config = SettingsConfigDict(
        env_file=".env", 
        env_file_encoding="utf-8", 
        extra="ignore"
    )


# Создаем единственный экземпляр настроек для импорта в другие модули
settings = Settings()
