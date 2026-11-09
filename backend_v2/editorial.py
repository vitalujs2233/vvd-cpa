"""Public articles/cases and a protected editorial dashboard. Financial routes are untouched."""
import json
import re
from typing import Optional
from urllib.parse import urlsplit

from fastapi import APIRouter, File, Header, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import text
from database import engine
from stars_payments import require_telegram_id
from access_guard import authorized_admin
from home_ads import sanitize

router = APIRouter(prefix="/articles", tags=["Editorial"])
SLUG = r"^[a-z0-9][a-z0-9-]*$"


def admin_auth(header: Optional[str]):
    uid = require_telegram_id(header)
    if not authorized_admin(uid):
        raise HTTPException(403, "Только для администратора")


def ensure_schema():
    # Dedicated editorial storage: does not change existing CPA/finance tables.
    with engine.begin() as db:
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS public.vvd_editorial (
                id INTEGER PRIMARY KEY CHECK (id=1),
                version INTEGER NOT NULL DEFAULT 1,
                content JSONB NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        """))
        db.execute(text("""
            INSERT INTO public.vvd_editorial (id,version,content)
            VALUES (1,1,'{"categories":[],"articles":[]}'::jsonb)
            ON CONFLICT(id) DO NOTHING
        """))
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS public.vvd_editorial_images (
                image_id VARCHAR(64) PRIMARY KEY,
                image_data BYTEA NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        """))


class EditorialCategory(BaseModel):
    id: str = Field(min_length=1, max_length=64, pattern=SLUG)
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=300)
    image_url: str = Field(default="", max_length=2048)
    active: bool = True
    sort_order: int = Field(default=100, ge=-10000, le=10000)


    @field_validator("image_url")
    @classmethod
    def valid_image_url(cls, value: str) -> str:
        if value:
            parsed = urlsplit(value)
            if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
                raise ValueError("Фото категории должно иметь HTTPS-ссылку")
        return value


class ArticleBlock(BaseModel):
    type: str = Field(pattern=r"^(paragraph|heading|image|link|quote)$")
    text: str = Field(default="", max_length=12000)
    url: str = Field(default="", max_length=2048)
    alt: str = Field(default="", max_length=200)

    @field_validator("url")
    @classmethod
    def safe_url(cls, value):
        if value:
            parsed = urlsplit(value)
            if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
                raise ValueError("Ссылка должна начинаться с https://")
        return value


class Article(BaseModel):
    slug: str = Field(min_length=1, max_length=100, pattern=SLUG)
    category_id: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=180)
    excerpt: str = Field(default="", max_length=500)
    cover_url: str = Field(default="", max_length=2048)
    seo_title: str = Field(default="", max_length=180)
    seo_description: str = Field(default="", max_length=300)
    tags: list[str] = Field(default_factory=list, max_length=20)
    blocks: list[ArticleBlock] = Field(default_factory=list, max_length=150)
    published: bool = False
    published_at: str = Field(default="", max_length=40)
    updated_at: str = Field(default="", max_length=40)

    @field_validator("cover_url")
    @classmethod
    def safe_cover(cls, value):
        if value and (urlsplit(value).scheme != "https" or not urlsplit(value).hostname):
            raise ValueError("Обложка должна быть доступна по HTTPS")
        return value

    @field_validator("tags")
    @classmethod
    def valid_tags(cls, tags):
        if any(not tag.strip() or len(tag)>40 for tag in tags):
            raise ValueError("Каждый тег должен содержать от 1 до 40 символов")
        return tags


class EditorialContent(BaseModel):
    categories: list[EditorialCategory] = Field(default_factory=list, max_length=80)
    articles: list[Article] = Field(default_factory=list, max_length=800)

    @model_validator(mode="after")
    def check_links(self):
        category_ids = [c.id for c in self.categories]
        slugs = [a.slug for a in self.articles]
        if len(set(category_ids)) != len(category_ids) or len(set(slugs)) != len(slugs):
            raise ValueError("Повторяющийся ID категории или адрес статьи")
        if any(a.category_id not in category_ids for a in self.articles):
            raise ValueError("Каждая статья должна иметь существующую категорию")
        return self


class EditorialSave(EditorialContent):
    version: int = Field(ge=1)


def load():
    ensure_schema()
    with engine.connect() as db:
        row = db.execute(text("SELECT version,content FROM public.vvd_editorial WHERE id=1")).mappings().one()
    return {"version": row["version"], **row["content"]}


@router.get("")
def public_articles():
    content = load()
    categories = sorted((c for c in content["categories"] if c.get("active", True)),
                        key=lambda c: (c.get("sort_order",100), c["name"]))
    valid_ids = {c["id"] for c in categories}
    articles = sorted((a for a in content["articles"]
                       if a.get("published") and a["category_id"] in valid_ids),
                      key=lambda a: a.get("published_at", ""), reverse=True)
    # The listing does not expose the full editorial body; detail endpoint handles it.
    summaries = [{k:v for k,v in a.items() if k != "blocks"} for a in articles]
    return {"categories": categories, "articles": summaries}


@router.get("/images/{image_id}")
def image(image_id: str):
    if not re.fullmatch(SLUG, image_id) or len(image_id)>64:
        raise HTTPException(404, "Не найдено")
    ensure_schema()
    with engine.connect() as db:
        blob = db.execute(text("SELECT image_data FROM public.vvd_editorial_images WHERE image_id=:id"),
                          {"id":image_id}).scalar_one_or_none()
    if blob is None:
        raise HTTPException(404, "Фото не найдено")
    return Response(content=bytes(blob),media_type="image/webp",
                    headers={"Cache-Control":"public, max-age=300","X-Content-Type-Options":"nosniff"})


@router.get("/admin")
def admin_articles(x_telegram_init_data: Optional[str]=Header(None)):
    admin_auth(x_telegram_init_data)
    return load()


@router.put("/admin")
def save_articles(payload: EditorialSave, x_telegram_init_data: Optional[str]=Header(None)):
    admin_auth(x_telegram_init_data)
    ensure_schema()
    value=json.dumps(payload.model_dump(exclude={"version"}),ensure_ascii=False)
    with engine.begin() as db:
        version=db.execute(text("""
            UPDATE public.vvd_editorial SET content=CAST(:body AS jsonb),
                version=version+1,updated_at=now()
            WHERE id=1 AND version=:version RETURNING version
        """),{"body":value,"version":payload.version}).scalar_one_or_none()
    if version is None:
        raise HTTPException(409,"Статьи были изменены. Обновите редактор.")
    return {"success":True,"version":version}


@router.post("/admin/images/{image_id}")
async def upload_image(image_id: str, image:UploadFile=File(...),
                       x_telegram_init_data:Optional[str]=Header(None)):
    admin_auth(x_telegram_init_data)
    if len(image_id)>64 or not re.fullmatch(SLUG,image_id):
        raise HTTPException(422,"Неверный ID изображения")
    encoded=await sanitize(image)  # JPG/PNG/WebP, size validation, optimized WebP
    ensure_schema()
    with engine.begin() as db:
        at=db.execute(text("""
            INSERT INTO public.vvd_editorial_images (image_id,image_data)
            VALUES (:id,:data) ON CONFLICT(image_id)
            DO UPDATE SET image_data=EXCLUDED.image_data,updated_at=now()
            RETURNING updated_at
        """),{"id":image_id,"data":encoded}).scalar_one()
    return {"image_url":f"/articles/images/{image_id}?v={int(at.timestamp()*1000000)}"}


@router.get("/{slug}")
def public_article(slug:str):
    if not re.fullmatch(SLUG,slug) or len(slug)>100:
        raise HTTPException(404,"Статья не найдена")
    content=load()
    visible={c["id"] for c in content["categories"] if c.get("active",True)}
    article=next((a for a in content["articles"]
                  if a["slug"]==slug and a.get("published") and a["category_id"] in visible),None)
    if article is None:
        raise HTTPException(404,"Статья не найдена")
    return {"article":article}
