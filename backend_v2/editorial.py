"""Public articles/cases and a protected editorial dashboard. Financial routes are untouched."""
import json
import re
from datetime import datetime, timezone
from typing import Optional, Literal
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

        db.execute(text("""
            ALTER TABLE public.vvd_editorial
            ADD COLUMN IF NOT EXISTS demo_seeded BOOLEAN NOT NULL DEFAULT FALSE
        """))
        # One-time, additive demo content. Never overwrite categories or existing posts.
        row = db.execute(text("""
            SELECT content, demo_seeded FROM public.vvd_editorial
            WHERE id=1 FOR UPDATE
        """)).mappings().one()
        if not row["demo_seeded"]:
            data = dict(row["content"])
            categories = list(data.get("categories", []))
            articles = list(data.get("articles", []))
            if not any(c.get("id") == "vvd-demo" for c in categories):
                categories.append({
                    "id": "vvd-demo", "name": "Демо-статьи",
                    "description": "Примеры оформления публикаций VVD CPA.",
                    "image_url": "",
                    "active": True, "sort_order": 900
                })
            now = datetime.now(timezone.utc).isoformat()
            demo_articles = [
                {
                    "slug": "demo-cpa-basics", "category_id": "vvd-demo",
                    "title": "Демо: как устроен CPA-маркетинг",
                    "excerpt": "Простой пример оформления статьи: офферы, действия пользователей и статистика. Без обещаний заработка.",
                    "cover_url": "https://vitalujs2233.github.io/vvd-cpa/articles/demo-cpa-basics.svg",
                    "seo_title": "Как работает CPA-маркетинг — пример статьи VVD CPA",
                    "seo_description": "Демонстрационная статья об основах CPA-маркетинга, офферах и учёте конверсий.",
                    "tags": ["Демо", "CPA", "Обучение"],
                    "blocks": [
                        {"type": "heading", "text": "Что такое CPA-модель?", "url": "", "alt": ""},
                        {"type": "paragraph", "text": "CPA (Cost Per Action) — модель сотрудничества, при которой результат оценивается по заранее определённому действию. Например, пользователь может отправить заявку на разрешённый сервис, если это соответствует условиям оффера.", "url": "", "alt": ""},
                        {"type": "heading", "text": "Из чего состоит рабочий процесс", "url": "", "alt": ""},
                        {"type": "paragraph", "text": "Вебмастер выбирает подходящий оффер, знакомится с правилами и получает ссылку для отслеживания переходов. Когда пользователь выполняет целевое действие, партнёрская система может передать сведения о конверсии через Postback. Подтверждение и начисления зависят от условий оффера.", "url": "", "alt": ""},
                        {"type": "heading", "text": "Что полезно проверить", "url": "", "alt": ""},
                        {"type": "paragraph", "text": "Перед запуском важно прочитать ограничения по источникам трафика и регионам, проверить корректность ссылки и отслеживания и не делать вводящих в заблуждение обещаний. Для удобства работы документы, инструменты и статистику полезно держать в одном кабинете.", "url": "", "alt": ""},
                        {"type": "quote", "text": "Это демонстрационный материал для проверки внешнего вида раздела. Он не является реальным кейсом или финансовой рекомендацией.", "url": "", "alt": ""}
                    ],
                    "published": True, "published_at": now, "updated_at": now
                },
                {
                    "slug": "demo-cpa-analytics", "category_id": "vvd-demo",
                    "title": "Демо: как читать статистику рекламной кампании",
                    "excerpt": "Учебная статья о кликах, CTR, конверсиях и сравнении результатов с красивой обложкой.",
                    "cover_url": "https://vitalujs2233.github.io/vvd-cpa/articles/demo-analytics.svg",
                    "seo_title": "Основные показатели CPA — пример статьи VVD CPA",
                    "seo_description": "Демонстрационный материал об аналитике кампаний: клики, CTR, CR и конверсии.",
                    "tags": ["Демо", "Аналитика", "Статистика"],
                    "blocks": [
                        {"type": "heading", "text": "Для чего нужна аналитика", "url": "", "alt": ""},
                        {"type": "paragraph", "text": "Показатели помогают понять, замечают ли люди объявление и выполняют ли ожидаемые действия. При этом один показатель редко объясняет всю картину — полезно сравнивать несколько метрик и учитывать качество данных.", "url": "", "alt": ""},
                        {"type": "heading", "text": "Основные термины", "url": "", "alt": ""},
                        {"type": "paragraph", "text": "Показы — сколько раз отображалось объявление. Клики — сколько раз по нему переходили. CTR — отношение числа кликов к числу показов. CR — доля переходов, закончившихся целевым действием. Подтверждённые конверсии — действия, которые приняли по условиям оффера.", "url": "", "alt": ""},
                        {"type": "heading", "text": "Как использовать данные", "url": "", "alt": ""},
                        {"type": "paragraph", "text": "Сначала убедитесь, что ссылки и события учитываются корректно. Затем сравнивайте показатели за сопоставимые периоды. Если данных мало, не делайте поспешных выводов. Обращайте внимание на правила рекламных платформ и прозрачность информации для пользователей.", "url": "", "alt": ""},
                        {"type": "quote", "text": "Цифры и ситуации в этой статье учебные. Здесь нет реальных результатов рекламной кампании.", "url": "", "alt": ""}
                    ],
                    "published": True, "published_at": now, "updated_at": now
                }
            ]
            existing = {article.get("slug") for article in articles}
            articles.extend(a for a in demo_articles if a["slug"] not in existing)
            data["categories"] = categories
            data["articles"] = articles
            db.execute(text("""
                UPDATE public.vvd_editorial
                SET content=CAST(:content AS jsonb), version=version+1,
                    demo_seeded=TRUE, updated_at=now()
                WHERE id=1
            """), {"content": json.dumps(data, ensure_ascii=False)})


class EditorialCategory(BaseModel):
    id: str = Field(min_length=1, max_length=64, pattern=SLUG)
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=300)
    image_url: str = Field(default="", max_length=2048)
    active: bool = True
    show_on_web: bool = True
    show_in_mini_app: bool = True
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
    show_on_web: bool = True
    show_in_mini_app: bool = True
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


def visible_on_surface(entry: dict, surface: Literal["web", "mini"]) -> bool:
    # Legacy entries created before the surface selector remain visible on both.
    key = "show_on_web" if surface == "web" else "show_in_mini_app"
    return entry.get(key, True) is not False


@router.get("")
def public_articles(surface: Literal["web", "mini"] = "web"):
    content = load()
    categories = sorted((c for c in content["categories"]
                         if c.get("active", True) and visible_on_surface(c, surface)),
                        key=lambda c: (c.get("sort_order",100), c["name"]))
    valid_ids = {c["id"] for c in categories}
    articles = sorted((a for a in content["articles"]
                       if a.get("published") and a["category_id"] in valid_ids
                       and visible_on_surface(a, surface)),
                      key=lambda a: a.get("published_at", ""), reverse=True)
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
def public_article(slug:str, surface: Literal["web", "mini"] = "web"):
    if not re.fullmatch(SLUG,slug) or len(slug)>100:
        raise HTTPException(404,"Статья не найдена")
    content=load()
    visible={c["id"] for c in content["categories"]
             if c.get("active",True) and visible_on_surface(c, surface)}
    article=next((a for a in content["articles"]
                  if a["slug"]==slug and a.get("published")
                  and a["category_id"] in visible and visible_on_surface(a, surface)),None)
    if article is None:
        raise HTTPException(404,"Статья не найдена")
    return {"article":article}
