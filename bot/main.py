import os
from aiogram import Bot, Dispatcher, types
from aiogram.filters import CommandStart
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo

# Сюда нужно будет вставить токен твоего бота от @BotFather
BOT_TOKEN = "ТВОЙ_ТОКЕН_БОТА"
# Ссылка на твой уже запущенный хостинг Mini App
MINI_APP_URL = "https://github.io"

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()

@dp.message(CommandStart())
async def command_start_handler(message: types.Message):
    tg_user = message.from_user
    
    # Структура кнопки для открытия Mini App на весь экран по ТЗ
    markup = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(
                text="🚀 Открыть VVD CPA", 
                web_app=WebAppInfo(url=MINI_APP_URL)
            )
        ]
    ])
    
    # Приветственный текст строго по твоему ТЗ
    welcome_text = (
        f"Привет, {tg_user.first_name}! Охотник за $$!\n\n"
        f"Добро пожаловать в приватную дейтинг-партнерку **VVD CPA**.\n"
        f"Нажимай кнопку ниже, бери смартлинку и начинай зарабатывать!"
    )
    
    await message.answer(welcome_text, reply_markup=markup, parse_mode="Markdown")

async def main():
    print("Бот VVD CPA успешно запущен...")
    await dp.start_polling(bot)

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
