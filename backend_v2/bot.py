import asyncio
import logging
import os

from aiogram import Bot, Dispatcher, types
from aiogram.filters import CommandStart
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo

from database import save_user

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BOT_TOKEN = os.getenv("BOT_TOKEN")
if not BOT_TOKEN:
    raise RuntimeError("BOT_TOKEN не найден в Environment")

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()


@dp.message(CommandStart())
async def cmd_start(message: types.Message):
    tg_user = message.from_user
    if not tg_user:
        return

    try:
        save_user(
            telegram_id=tg_user.id,
            first_name=tg_user.first_name or "",
            last_name=tg_user.last_name,
            username=tg_user.username,
            photo_url=None,
        )
        logger.info("Пользователь сохранён: %s (%s)", tg_user.first_name, tg_user.id)
    except Exception as error:
        logger.exception("Ошибка сохранения пользователя %s: %s", tg_user.id, error)

    keyboard = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text="🚀 Запустить VVD CPA",
            web_app=WebAppInfo(url="https://vitalujs2233.github.io/vvd-cpa/"),
        )
    ]])

    await message.answer(
        text=(
            f"👋 С возвращением, {tg_user.first_name}!\n\n"
            "Рады видеть вас на платформе VVD CPA.\n"
            "Ваш кабинет и партнёрские данные готовы к работе.\n\n"
            "Нажмите на кнопку ниже, чтобы запустить приложение 👇"
        ),
        reply_markup=keyboard,
    )


async def start_bot():
    logger.info("Запуск Telegram-бота VVD CPA")
    try:
        await bot.delete_webhook(drop_pending_updates=False)
        await dp.start_polling(bot)
    except asyncio.CancelledError:
        logger.info("Telegram-бот остановлен")
        raise
    finally:
        await bot.session.close()


async def send_telegram_message(telegram_id: int, text: str):
    try:
        await bot.send_message(chat_id=telegram_id, text=text)
        return True
    except Exception as error:
        logger.exception(
            "Ошибка отправки Telegram-уведомления пользователю %s: %s",
            telegram_id,
            error,
        )
        return False


if __name__ == "__main__":
    asyncio.run(start_bot())
