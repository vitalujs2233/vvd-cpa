"""Independent homepage advertising carousel. Images are sanitized and stored in Postgres."""
import io
import uuid
from typing import Optional
from urllib.parse import urlsplit
from fastapi import APIRouter, File, UploadFile, Form, Header, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator
from PIL import Image, UnidentifiedImageError, ImageOps
from sqlalchemy import text
from database import engine
from stars_payments import require_telegram_id
from access_guard import authorized_admin

router = APIRouter(prefix="/home-ads", tags=["Home carousel"])
MAX_FILE = 5 * 1024 * 1024

def admin(raw: Optional[str]):
    uid = require_telegram_id(raw)
    if not authorized_admin(uid):
        raise HTTPException(403, "Доступ только администратору")
    return uid

def safe_target(value: str) -> str:
    value = value.strip()
    if not value:
        return ""
    if len(value) > 2048 or any(c.isspace() or ord(c)<32 for c in value):
        raise ValueError("Некорректная ссылка")
    if value.startswith("/") and not value.startswith("//") and not value.startswith("/\\"):
        if "\\" in value or "#" in value:
            raise ValueError("Некорректная внутренняя ссылка")
        return value
    p = urlsplit(value)
    if p.scheme == "https" and p.hostname and not p.username and not p.password:
        return value
    if p.scheme == "tg" and p.netloc in ("resolve", "join", "user", "addstickers") and not p.username and not p.password:
        return value
    raise ValueError("Допустимы HTTPS, разрешённые tg:// и внутренние /ссылки")

def image_url(banner_id):
    return f"/home-ads/images/{banner_id}"

def serialize(row):
    return {"id":str(row["id"]),"title":row["title"],"image_url":image_url(row["id"]),
            "target_url":row["target_url"],"position":row["position"],"is_active":row["is_active"],
            "created_at":row["created_at"].isoformat(),"updated_at":row["updated_at"].isoformat()}

def lock_settings(conn):
    return conn.execute(text("SELECT autoplay FROM home_ad_settings WHERE id=1 FOR UPDATE")).scalar_one()

def check_limit(conn, excluded=None):
    count = conn.execute(text("SELECT count(*) FROM home_ad_banners WHERE is_active AND (:excluded IS NULL OR id<>CAST(:excluded AS uuid))"),{"excluded":str(excluded) if excluded else None}).scalar_one()
    if count >= 4:
        raise HTTPException(409,"Можно включить не более 4 баннеров")

async def sanitize(image: UploadFile):
    if image.content_type not in ("image/jpeg","image/png","image/webp"):
        raise HTTPException(400,"Поддерживаются JPG, PNG, WebP")
    raw = await image.read(MAX_FILE+1)
    if len(raw)>MAX_FILE:
        raise HTTPException(413,"Максимальный размер файла 5 МБ")
    try:
        with Image.open(io.BytesIO(raw)) as src:
            if src.format not in ("JPEG","PNG","WEBP") or src.width*src.height>20_000_000:
                raise ValueError("Bad image dimensions")
            src = ImageOps.exif_transpose(src)
            src.load()
            converted = src.convert("RGB")
            converted.thumbnail((1500,1000),Image.Resampling.LANCZOS)
            out=io.BytesIO()
            converted.save(out,format="WEBP",quality=83,method=4)
            result=out.getvalue()
    except (UnidentifiedImageError,OSError,ValueError,Image.DecompressionBombError):
        raise HTTPException(400,"Не удалось обработать изображение")
    if not result or len(result)>1_500_000:
        raise HTTPException(413,"Изображение слишком большое после обработки")
    return result

@router.get("/published")
def published():
    with engine.connect() as conn:
        rows=conn.execute(text("SELECT id,title,target_url,position,is_active,created_at,updated_at FROM home_ad_banners WHERE is_active ORDER BY position,created_at LIMIT 4")).mappings().all()
        autoplay=conn.execute(text("SELECT autoplay FROM home_ad_settings WHERE id=1")).scalar_one()
    return {"items":[serialize(r) for r in rows],"autoplay":bool(autoplay)}

@router.get("/images/{banner_id}")
def get_image(banner_id: uuid.UUID):
    with engine.connect() as conn:
        data=conn.execute(text("SELECT image_data FROM home_ad_banners WHERE id=:id"),{"id":str(banner_id)}).scalar_one_or_none()
    if data is None:
        raise HTTPException(404,"Изображение не найдено")
    return Response(content=bytes(data),media_type="image/webp",headers={"Cache-Control":"public, max-age=300","X-Content-Type-Options":"nosniff"})

@router.get("/admin")
def list_admin(x_telegram_init_data:Optional[str]=Header(None)):
    admin(x_telegram_init_data)
    with engine.connect() as conn:
        rows=conn.execute(text("SELECT id,title,target_url,position,is_active,created_at,updated_at FROM home_ad_banners ORDER BY position,created_at")).mappings().all()
        autoplay=conn.execute(text("SELECT autoplay FROM home_ad_settings WHERE id=1")).scalar_one()
    return {"items":[serialize(r) for r in rows],"autoplay":bool(autoplay)}

@router.post("/admin")
async def create_banner(image:UploadFile=File(...),title:str=Form(...),target_url:str=Form(""),is_active:bool=Form(False),x_telegram_init_data:Optional[str]=Header(None)):
    admin(x_telegram_init_data)
    if not title.strip() or len(title)>160:
        raise HTTPException(422,"Укажите название до 160 символов")
    try: target=safe_target(target_url)
    except ValueError as exc: raise HTTPException(422,str(exc))
    encoded=await sanitize(image)
    with engine.begin() as conn:
        lock_settings(conn)
        if is_active:check_limit(conn)
        position=conn.execute(text("SELECT COALESCE(MAX(position),-1)+1 FROM home_ad_banners")).scalar_one()
        ident=conn.execute(text("""INSERT INTO home_ad_banners(title,image_data,target_url,position,is_active)
          VALUES(:title,:image,:url,:position,:active) RETURNING id"""),
          {"title":title.strip(),"image":encoded,"url":target,"position":position,"active":is_active}).scalar_one()
    return {"id":str(ident)}

class EditBanner(BaseModel):
    title:str=Field(min_length=1,max_length=160)
    target_url:str=Field(default="",max_length=2048)
    is_active:bool=False
    @field_validator("target_url")
    @classmethod
    def check_url(cls,v):return safe_target(v)

@router.put("/admin/{banner_id}")
def edit_banner(banner_id:uuid.UUID,payload:EditBanner,x_telegram_init_data:Optional[str]=Header(None)):
    admin(x_telegram_init_data)
    with engine.begin() as conn:
        lock_settings(conn)
        current=conn.execute(text("SELECT is_active FROM home_ad_banners WHERE id=:id FOR UPDATE"),{"id":str(banner_id)}).scalar_one_or_none()
        if current is None:raise HTTPException(404,"Баннер не найден")
        if payload.is_active and not current:check_limit(conn,excluded=banner_id)
        conn.execute(text("""UPDATE home_ad_banners SET title=:title,target_url=:url,is_active=:active,updated_at=now()
          WHERE id=:id"""),{"title":payload.title.strip(),"url":payload.target_url,"active":payload.is_active,"id":str(banner_id)})
    return {"ok":True}

@router.post("/admin/{banner_id}/image")
async def replace_image(banner_id:uuid.UUID,image:UploadFile=File(...),x_telegram_init_data:Optional[str]=Header(None)):
    admin(x_telegram_init_data)
    encoded=await sanitize(image)
    with engine.begin() as conn:
        changed=conn.execute(text("UPDATE home_ad_banners SET image_data=:image,updated_at=now() WHERE id=:id RETURNING id"),{"image":encoded,"id":str(banner_id)}).scalar_one_or_none()
    if changed is None:raise HTTPException(404,"Баннер не найден")
    return {"ok":True}

@router.delete("/admin/{banner_id}")
def delete_banner(banner_id:uuid.UUID,x_telegram_init_data:Optional[str]=Header(None)):
    admin(x_telegram_init_data)
    with engine.begin() as conn:
        changed=conn.execute(text("DELETE FROM home_ad_banners WHERE id=:id RETURNING id"),{"id":str(banner_id)}).scalar_one_or_none()
    if changed is None:raise HTTPException(404,"Баннер не найден")
    return {"ok":True}

class Reorder(BaseModel):
    ids:list[uuid.UUID]=Field(max_length=500)

@router.put("/admin/order/items")
def reorder(payload:Reorder,x_telegram_init_data:Optional[str]=Header(None)):
    admin(x_telegram_init_data)
    if len(set(payload.ids))!=len(payload.ids):raise HTTPException(422,"Повторяющиеся ID")
    with engine.begin() as conn:
        lock_settings(conn)
        actual={str(x) for x in conn.execute(text("SELECT id FROM home_ad_banners")).scalars()}
        if actual!={str(x) for x in payload.ids}:raise HTTPException(409,"Список баннеров изменился")
        for index,ident in enumerate(payload.ids):
            conn.execute(text("UPDATE home_ad_banners SET position=:position,updated_at=now() WHERE id=:id"),{"position":index,"id":str(ident)})
    return {"ok":True}

class Settings(BaseModel):
    autoplay:bool

@router.put("/admin/settings")
def update_settings(payload:Settings,x_telegram_init_data:Optional[str]=Header(None)):
    admin(x_telegram_init_data)
    with engine.begin() as conn:
        conn.execute(text("UPDATE home_ad_settings SET autoplay=:autoplay WHERE id=1"),{"autoplay":payload.autoplay})
    return {"ok":True}
