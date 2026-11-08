"""External service directory for VVD CPA. Informational links only; no payments or purchases."""
import json
import re
from typing import Optional
from urllib.parse import urlsplit

from fastapi import APIRouter, Header, HTTPException, UploadFile, File
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import text
from database import engine
from stars_payments import require_telegram_id
from access_guard import authorized_admin
from home_ads import sanitize

router = APIRouter(prefix="/service-directory", tags=["Service Directory"])


def admin_id(raw: Optional[str]) -> int:
    uid = require_telegram_id(raw)
    if not authorized_admin(uid):
        raise HTTPException(status_code=403, detail="Доступ только администратору")
    return uid


class DirectoryCategory(BaseModel):
    id: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9][a-z0-9-]*$")
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=300)
    icon: str = Field(default="grid", max_length=32)
    sort_order: int = Field(default=100, ge=-10000, le=10000)
    active: bool = True


class DirectoryService(BaseModel):
    id: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9][a-z0-9-]*$")
    category_id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=150)
    description: str = Field(default="", max_length=750)
    benefits: str = Field(default="", max_length=2400)
    image_url: str = Field(default="", max_length=2048)
    website_url: str = Field(default="", max_length=2048)
    discount_text: str = Field(default="", max_length=300)
    promo_code: str = Field(default="", max_length=100)
    partner_link: bool = False
    active: bool = False
    sort_order: int = Field(default=100, ge=-10000, le=10000)

    @field_validator("website_url", "image_url")
    @classmethod
    def valid_https(cls, value: str) -> str:
        value = value.strip()
        if value:
            parsed = urlsplit(value)
            if (parsed.scheme != "https" or not parsed.hostname or
                    parsed.username or parsed.password or any(c.isspace() for c in value)):
                raise ValueError("Укажите обычную HTTPS-ссылку")
        return value

    @model_validator(mode="after")
    def active_must_have_url(self):
        if self.active and not self.website_url:
            raise ValueError("Для публикации сервиса необходимо указать HTTPS-ссылку")
        return self


class DirectoryContent(BaseModel):
    categories: list[DirectoryCategory] = Field(default_factory=list, max_length=60)
    services: list[DirectoryService] = Field(default_factory=list, max_length=300)

    @model_validator(mode="after")
    def validate_relations(self):
        categories = [c.id for c in self.categories]
        services = [s.id for s in self.services]
        if len(set(categories)) != len(categories) or len(set(services)) != len(services):
            raise ValueError("Повторяющиеся ID категорий или сервисов")
        if any(s.category_id not in categories for s in self.services):
            raise ValueError("Каждый сервис должен относиться к существующей категории")
        return self


class DirectorySave(DirectoryContent):
    version: int = Field(ge=1)


def _load():
    with engine.connect() as conn:
        row = conn.execute(text(
            "SELECT version,content FROM public.vvd_service_directory WHERE id=1"
        )).mappings().one()
    return {"version": row["version"], **row["content"]}


@router.get("")
def published_directory():
    data = _load()
    categories = sorted(
        [c for c in data["categories"] if c.get("active", True)],
        key=lambda item: (item.get("sort_order", 100), item["name"].lower())
    )
    visible_ids = {c["id"] for c in categories}
    services = sorted(
        [s for s in data["services"] if s.get("active") and s.get("website_url") and
         s.get("category_id") in visible_ids],
        key=lambda item: (item.get("sort_order", 100), item["name"].lower())
    )
    return {"version": data["version"], "categories": categories, "services": services}


# Upload service logos without requiring the administrator to host an image.
# Reuse the existing banner sanitizer: JPG/PNG/WebP, 5 MB input limit,
# EXIF orientation correction and optimized WebP output.
def _image_id(service_id: str) -> str:
    if len(service_id) > 64 or not re.fullmatch(r"[a-z0-9][a-z0-9-]*", service_id):
        raise HTTPException(status_code=422, detail="Неверный ID сервиса")
    return service_id


@router.get("/images/{service_id}")
def service_image(service_id: str):
    service_id = _image_id(service_id)
    with engine.connect() as conn:
        data = conn.execute(text("""
            SELECT image_data FROM public.vvd_service_directory_images
            WHERE service_id=:id
        """), {"id": service_id}).scalar_one_or_none()
    if data is None:
        raise HTTPException(status_code=404, detail="Фото сервиса не найдено")
    return Response(
        content=bytes(data),
        media_type="image/webp",
        headers={"Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff"},
    )


@router.post("/admin/images/{service_id}")
async def upload_service_image(
    service_id: str,
    image: UploadFile = File(...),
    x_telegram_init_data: Optional[str] = Header(None),
):
    admin_id(x_telegram_init_data)
    service_id = _image_id(service_id)
    encoded = await sanitize(image)
    with engine.begin() as conn:
        updated = conn.execute(text("""
            INSERT INTO public.vvd_service_directory_images(service_id,image_data)
            VALUES (:id,:data)
            ON CONFLICT(service_id) DO UPDATE SET
              image_data=EXCLUDED.image_data,updated_at=now()
            RETURNING updated_at
        """), {"id": service_id, "data": encoded}).scalar_one()
    # Use a versioned URL so replacing an image refreshes it on the phone.
    return {"image_url": f"/service-directory/images/{service_id}?v={int(updated.timestamp() * 1000000)}"}


@router.get("/admin")
def admin_directory(x_telegram_init_data: Optional[str] = Header(None)):
    admin_id(x_telegram_init_data)
    return _load()


@router.put("/admin")
def save_directory(payload: DirectorySave, x_telegram_init_data: Optional[str] = Header(None)):
    admin_id(x_telegram_init_data)
    data = payload.model_dump(exclude={"version"})
    with engine.begin() as conn:
        result = conn.execute(text("""
            UPDATE public.vvd_service_directory
               SET content=CAST(:content AS jsonb), version=version+1, updated_at=now()
             WHERE id=1 AND version=:expected
         RETURNING version
        """), {"content": json.dumps(data, ensure_ascii=False), "expected": payload.version}).scalar_one_or_none()
        if result is None:
            raise HTTPException(409, "Каталог уже изменён. Обновите страницу перед сохранением.")
    return {"success": True, "version": result}
