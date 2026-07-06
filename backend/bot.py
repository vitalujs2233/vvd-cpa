import asyncio
import logging
from aiogram import Bot, Dispatcher, types
from aiogram.filters import CommandStart
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo

# Импортируем конфигурации бэкенда
from backend.config import settings
# Импортируем асинхронную сессию для записи вебмастеров в Supabase
from backend.database import AsyncSessionLocal
# Импортируем модели таблиц SQLAlchemy
from backend.models.users import User, UserSettings

# Настраиваем логирование процессов в консоль сервера
logging.basicConfig(level=logging.INFO)

# Инициализируем бота и диспетчер на базе токена из .env
bot = Bot(token=settings.BOT_TOKEN)
dp = Dispatcher()


async def register_user_if_not_exists(tg_user: types.User) -> bool:
    """
    Асинхронная регистрация пользователя в Supabase PostgreSQL при первом старте.
    Возвращает True, если зарегистрирован новый пользователь, и False, если он уже был в базе.
    """
    async with AsyncSessionLocal() as session:
        try:
            # Ищем вебмастера в базе по его уникальному Telegram ID
            db_user = await session.get(User, tg_user.id)
            
            if not db_user:
                # Если пользователя нет — создаем новую запись в таблице 'users'
                new_user = User(
                    telegram_id=tg_user.id,
                    first_name=tg_user.first_name,
                    last_name=tg_user.last_name,
                    username=tg_user.username,
                    role="admin" if tg_user.id == settings.TELEGRAM_ADMIN_ID else "user"
                )
                session.add(new_user)
                
                # Создаем для него строку индивидуальных настроек по умолчанию в 'settings'
                new_settings = UserSettings(
                    user_id=tg_user.id,
                    push_enabled=True,
                    email_enabled=False,
                    language="Русский",
                    currency="USD"
                )
                session.add(new_settings)
                
                # Записываем изменения в Supabase
                await session.commit()
                logging.info(f"Зарегистрирован новый вебмастер: {tg_user.first_name} (ID: {tg_user.id})")
                return True
                
            return False
            
        except Exception as error:
            logging.error(f"Ошибка транзакции при регистрации пользователя {tg_user.id}: {error}")
            await session.rollback()
            return False


@dp.message(CommandStart())
async def cmd_start(message: types.Message):
    """
    Обработчик системной команды /start.
    Регистрирует вебмастера в Supabase и отправляет кнопку запуска Mini App.
    """
    tg_user = message.from_user
    if not tg_user:
        return

    # Запускаем асинхронную проверку и регистрацию пользователя в Supabase
    is_new = await register_user_if_not_exists(tg_user)
    
    # Ссылка на ваш рабочий фронтенд VVD CPA на GitHub Pages
    web_app_url = "https://vitalujs2233.github.io/vvd-cpa/"

    # Оформляем красивую кнопку быстрого нативного запуска Mini App по спецификации
    launch_button = InlineKeyboardButton(
        text="🚀 Запустить VVD CPA",
        web_app=WebAppInfo(url=web_app_url)
    )
    keyboard = InlineKeyboardMarkup(inline_keyboard=[[launch_button]])

    if is_new:
        welcome_text = (
            f"👑 Приветствуем, {tg_user.first_name}!\n\n"
            f"Вы успешно зарегистрированы в приватной CPA-сети **VVD CPA**.\n"
            f"Теперь вам доступен полный функционал личного кабинета, "
            f"создание SmartLink, детальный анализ трафика и чат комьюнити!\n\n"
            f"Нажмите на кнопку ниже, чтобы войти в ваш Premium-кабинет 👇"
        )
    else:
        welcome_text = (
            f"👋 С возвращением, {tg_user.first_name}!\n\n"
            f"Рады видеть вас снова на платформе VVD CPA.\n"
            f"Ваша сессия авторизована. Балансы и смартлинки активны.\n\n"
            f"Нажмите на кнопку ниже, чтобы запустить приложение 👇"
        )

    # Отправляем сообщение с поддержкой Markdown форматирования
    await message.answer(text=welcome_text, reply_markup=keyboard, parse_mode="Markdown")


async def main():
    print("=== ЗАПУСК TELEGRAM-БОТА VVD CPA ===")
    print("Бот успешно подключен к Supabase PostgreSQL.")
    print("Ожидание запуска команды /start пользователями...")
    try:
        # Запуск асинхронного поллинга сообщений
        await dp.start_polling(bot)
    finally:
        await bot.session.close()


if __name__ == "__main__":
    # Запускаем цикл событий бота
    asyncio.run(main())
