from fastapi import FastAPI
from pydantic import BaseModel
from database import check_database, save_user

app = FastAPI(
    title="VVD CPA Backend V2",
    version="2.0"
)


@app.get("/")
async def root():
    return {
        "status": "ok",
        "message": "Backend V2 работает"
    }


@app.get("/health")
async def health():
    return {
        "status": "healthy"
    }


@app.get("/db")
async def db():
    try:
        check_database()
        return {
            "database": "connected"
        }
    except Exception as e:
        return {
            "database": "error",
            "details": str(e)
        }
        
class TelegramUser(BaseModel):
    telegram_id: int
    first_name: str
    last_name: str | None = None
    username: str | None = None
    photo_url: str | None = None


@app.post("/auth")
async def auth(user: TelegramUser):
    save_user(
        telegram_id=user.telegram_id,
        first_name=user.first_name,
        last_name=user.last_name,
        username=user.username,
        photo_url=user.photo_url,
    )

    return {
        "success": True,
        "message": "Пользователь сохранён"
    }
