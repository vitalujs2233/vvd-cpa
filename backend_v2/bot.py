import asyncio
import logging
import os

from aiogram import Bot, Dispatcher, F, types
from aiogram.filters import CommandStart, CommandObject
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo

from database import save_user
import tools_stars
from stars_payments import check_pre_checkout, credit_successful_payment, reverse_refunded_payment

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BOT_TOKEN = os.getenv("BOT_TOKEN")
if not BOT_TOKEN:
    raise RuntimeError("BOT_TOKEN не найден в Environment")

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()


@dp.message(CommandStart())
async def cmd_start(message: types.Message, command: CommandObject):
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
            referral_code=(command.args or "").strip()[:64],
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


@dp.pre_checkout_query()
async def on_stars_pre_checkout(query: types.PreCheckoutQuery):
    """Only approve a verified, matching unpaid invoice within Telegram's deadline."""
    try:
        if query.invoice_payload.startswith(tools_stars.PREFIX):
            accepted = await asyncio.to_thread(
                tools_stars.pre_checkout, query.invoice_payload, query.from_user.id,
                query.currency, query.total_amount, query.id)
        else:
            accepted = await asyncio.to_thread(
                check_pre_checkout, query.invoice_payload, query.from_user.id,
                query.currency, query.total_amount)
        await query.answer(
            ok=accepted,
            error_message=None if accepted else "Счёт недействителен или устарел. Создайте новый.",
        )
    except Exception:
        logger.exception("Stars pre-checkout validation error")
        await query.answer(ok=False, error_message="Ошибка проверки оплаты. Попробуйте позже.")


@dp.message(F.successful_payment)
async def on_stars_successful_payment(message: types.Message):
    payment = message.successful_payment
    if not payment or not message.from_user:
        return
    try:
        credited = await asyncio.to_thread(
            tools_stars.settle if payment.invoice_payload.startswith(tools_stars.PREFIX) else credit_successful_payment, payment.invoice_payload,
            message.from_user.id, payment.currency, payment.total_amount,
            payment.telegram_payment_charge_id,
        )
        if not credited:
            logger.error("Stars payment requires reconciliation; charge=%s", payment.telegram_payment_charge_id)
        else:
            await message.answer("Оплата подтверждена. Баланс инструментов обновлён." if payment.invoice_payload.startswith(tools_stars.PREFIX) else "⭐ Оплата подтверждена! Цифровые кредиты добавлены в кошелёк.")
    except Exception:
        # IMPORTANT: don't acknowledge settlement as completed on a DB error.
        # Telegram may retry an update; order ID and charge ID are idempotent.
        logger.exception("Stars settlement failed; charge=%s", payment.telegram_payment_charge_id)


@dp.message(F.refunded_payment)
async def on_stars_refund(message: types.Message):
    refund = message.refunded_payment
    if not refund or not message.from_user or refund.currency != "XTR":
        return
    if (refund.invoice_payload or '').startswith(tools_stars.PREFIX):
        await asyncio.to_thread(tools_stars.settle, refund.invoice_payload,
                                message.from_user.id, refund.currency, refund.total_amount,
                                refund.telegram_payment_charge_id, True)
        return
    try:
        await asyncio.to_thread(
            reverse_refunded_payment, refund.telegram_payment_charge_id,
            message.from_user.id, refund.total_amount,
        )
    except Exception:
        logger.exception("Stars refund reconciliation failed")



async def start_bot():
    """Use a secured webhook when configured; preserve existing polling otherwise."""
    webhook_url = os.getenv("TELEGRAM_WEBHOOK_URL", "").strip()
    logger.info("Запуск Telegram-бота VVD CPA (%s)", "webhook" if webhook_url else "polling")
    # getMe is performed using the exact same BOT_TOKEN that signs Mini App initData.
    # Log only public bot metadata: NEVER the token or signed initData.
    identity = await bot.get_me()
    logger.info("telegram_bot_identity username=@%s id=%s", identity.username, identity.id)
    if (identity.username or "").lower() != "vvd_cpa_bot":
        logger.error("telegram_bot_identity_mismatch expected=@vvd_cpa_bot")
    try:
        if webhook_url:
            secret = os.getenv("TELEGRAM_WEBHOOK_SECRET", "")
            if not secret or len(secret) < 20:
                raise RuntimeError("Set a strong TELEGRAM_WEBHOOK_SECRET for webhook mode")
            await bot.set_webhook(
                url=webhook_url,
                secret_token=secret,
                allowed_updates=dp.resolve_used_update_types(),
                drop_pending_updates=False,
            )
            logger.info("Telegram webhook configured")
        else:
            await bot.delete_webhook(drop_pending_updates=False)
            await dp.start_polling(bot)
    except asyncio.CancelledError:
        logger.info("Telegram-бот остановлен")
        raise
    finally:
        if not webhook_url:
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
