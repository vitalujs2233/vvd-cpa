"""Telegram-authenticated community article proposals, reviewed before publication.

Separate tables keep untrusted proposals outside published editorial JSON.
Financial and account-storage schemas are not changed.
"""
import json
import threading
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, File, Header, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import text

from database import engine
from editorial import Article, ArticleBlock, EditorialContent, admin_auth, load
from home_ads import sanitize
from stars_payments import require_telegram_id

router = APIRouter(prefix="/article-contributions", tags=["Community editorial"])
_schema_lock = threading.Lock()
_schema_ready = False


def ensure_contributions():
    global _schema_ready
    if _schema_ready:
        return
    with _schema_lock:
        if _schema_ready:
            return
        with engine.begin() as db:
            db.execute(text("""
                CREATE TABLE IF NOT EXISTS public.vvd_article_contributions (
                  id UUID PRIMARY KEY,
                  author_uid BIGINT NOT NULL,
                  original JSONB NOT NULL,
                  edited JSONB NOT NULL,
                  status VARCHAR(24) NOT NULL DEFAULT 'pending',
                  moderator_note VARCHAR(1000) NOT NULL DEFAULT '',
                  article_slug VARCHAR(100),
                  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )
            """))
            db.execute(text("""
                CREATE INDEX IF NOT EXISTS vvd_article_contributions_author_idx
                ON public.vvd_article_contributions(author_uid,created_at DESC)
            """))
            db.execute(text("""
                CREATE TABLE IF NOT EXISTS public.vvd_contribution_images (
                  id UUID PRIMARY KEY,
                  author_uid BIGINT NOT NULL,
                  data BYTEA NOT NULL,
                  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )
            """))
        _schema_ready = True


def registered_uid(header: str | None) -> int:
    uid = require_telegram_id(header)
    with engine.connect() as db:
        found = db.execute(
            text("SELECT 1 FROM users WHERE telegram_id=:uid"),
            {"uid": uid}
        ).scalar_one_or_none()
    if not found:
        raise HTTPException(403, "Сначала зарегистрируйтесь через Telegram")
    return uid


class ContributionContent(BaseModel):
    rights_confirmed: Literal[True]
    author_name: str = Field(min_length=2, max_length=60)
    category_id: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=8, max_length=180)
    excerpt: str = Field(min_length=20, max_length=500)
    cover_url: str = Field(default="", max_length=2048)
    blocks: list[ArticleBlock] = Field(min_length=1, max_length=24)

    @field_validator("author_name", "title", "excerpt")
    @classmethod
    def clean_text(cls, value: str):
        value = value.strip()
        if not value:
            raise ValueError("Обязательное поле")
        return value

    @field_validator("cover_url")
    @classmethod
    def safe_cover(cls, value: str):
        if value and not value.startswith("https://"):
            raise ValueError("Обложка должна быть доступна по HTTPS")
        return value

    @model_validator(mode="after")
    def check_body(self):
        if not any(b.type == "paragraph" and len(b.text.strip()) >= 100 for b in self.blocks):
            raise ValueError("Добавьте хотя бы один содержательный абзац (от 100 символов)")
        if sum(len(b.text) for b in self.blocks) > 30000:
            raise ValueError("Слишком длинная статья")
        if sum(b.type == "image" for b in self.blocks) > 8:
            raise ValueError("Не более восьми иллюстраций")
        return self


def check_category(category_id: str):
    content = load()
    if not any(c["id"] == category_id and c.get("active", True)
               for c in content["categories"]):
        raise HTTPException(422, "Категория недоступна")


def safe_submission(row, admin: bool = False):
    result = {
        "id": str(row["id"]), "status": row["status"],
        "created_at": row["created_at"].isoformat(),
        "updated_at": row["updated_at"].isoformat(),
        "moderator_note": row["moderator_note"],
        "article_slug": row["article_slug"],
        "original": row["original"],
    }
    if admin:
        result["edited"] = row["edited"]
        result["author_uid"] = row["author_uid"]
    return result


@router.get("/mine")
def my_submissions(x_telegram_init_data: str | None = Header(None)):
    uid = registered_uid(x_telegram_init_data)
    ensure_contributions()
    with engine.connect() as db:
        rows = db.execute(text("""
            SELECT * FROM public.vvd_article_contributions
            WHERE author_uid=:uid ORDER BY created_at DESC LIMIT 100
        """), {"uid": uid}).mappings().all()
    return {"submissions": [safe_submission(r) for r in rows]}


@router.post("")
def submit_article(payload: ContributionContent,
                   x_telegram_init_data: str | None = Header(None)):
    uid = registered_uid(x_telegram_init_data)
    check_category(payload.category_id)
    ensure_contributions()
    now = datetime.now(timezone.utc)
    submission_id = uuid4()
    document = json.dumps(payload.model_dump(), ensure_ascii=False)
    with engine.begin() as db:
        # Limit floods even if the same author opens multiple tabs.
        db.execute(text("SELECT pg_advisory_xact_lock(:uid)"), {"uid": uid})
        recent = db.execute(text("""
            SELECT count(*) FROM public.vvd_article_contributions
            WHERE author_uid=:uid AND created_at > now()-interval '24 hours'
        """), {"uid": uid}).scalar_one()
        if recent >= 3:
            raise HTTPException(429, "Можно отправить не более трёх статей за 24 часа")
        db.execute(text("""
            INSERT INTO public.vvd_article_contributions
              (id,author_uid,original,edited,created_at,updated_at)
            VALUES (CAST(:id AS uuid),:uid,CAST(:body AS jsonb),
                    CAST(:body AS jsonb),:now,:now)
        """), {"id": str(submission_id), "uid": uid,
               "body": document, "now": now})
    return {"id": str(submission_id), "status": "pending"}


@router.post("/{submission_id}/revise")
def revise_submission(submission_id: UUID, payload: ContributionContent,
                      x_telegram_init_data: str | None = Header(None)):
    uid = registered_uid(x_telegram_init_data)
    check_category(payload.category_id)
    ensure_contributions()
    with engine.begin() as db:
        row = db.execute(text("""
            SELECT author_uid,status FROM public.vvd_article_contributions
            WHERE id=CAST(:id AS uuid) FOR UPDATE
        """), {"id": str(submission_id)}).mappings().first()
        if not row or row["author_uid"] != uid:
            raise HTTPException(404, "Материал не найден")
        if row["status"] != "revision":
            raise HTTPException(409, "Материал сейчас не ожидает доработки")
        # The initial original is immutable; the revised version becomes the
        # new moderated copy, and cannot go live without fresh approval.
        db.execute(text("""
            UPDATE public.vvd_article_contributions
            SET edited=CAST(:body AS jsonb),status='pending',
                moderator_note='',updated_at=now()
            WHERE id=CAST(:id AS uuid)
        """), {"id": str(submission_id),
               "body": json.dumps(payload.model_dump(),ensure_ascii=False)})
    return {"success": True, "status": "pending"}


@router.post("/images")
async def upload_contribution_image(
    image: UploadFile = File(...),
    x_telegram_init_data: str | None = Header(None)
):
    uid = registered_uid(x_telegram_init_data)
    ensure_contributions()
    encoded = await sanitize(image)  # Validated JPG/PNG/WebP, optimized WebP.
    img_id = uuid4()
    with engine.begin() as db:
        db.execute(text("SELECT pg_advisory_xact_lock(:uid)"), {"uid": uid})
        total = db.execute(text("""
            SELECT count(*) FROM public.vvd_contribution_images
            WHERE author_uid=:uid AND created_at>now()-interval '24 hours'
        """), {"uid": uid}).scalar_one()
        if total >= 15:
            raise HTTPException(429, "Достигнут дневной лимит изображений")
        db.execute(text("""
            INSERT INTO public.vvd_contribution_images(id,author_uid,data)
            VALUES(CAST(:id AS uuid),:uid,:data)
        """), {"id": str(img_id), "uid": uid, "data": encoded})
    return {"image_url": f"/article-contributions/images/{img_id}"}


@router.get("/images/{image_id}")
def contribution_image(image_id: UUID):
    ensure_contributions()
    with engine.connect() as db:
        blob = db.execute(text("""
            SELECT data FROM public.vvd_contribution_images WHERE id=CAST(:id AS uuid)
        """), {"id": str(image_id)}).scalar_one_or_none()
    if blob is None:
        raise HTTPException(404, "Фото не найдено")
    return Response(bytes(blob), media_type="image/webp",
                    headers={"Cache-Control": "public,max-age=3600",
                             "X-Content-Type-Options": "nosniff"})


@router.get("/admin")
def admin_queue(x_telegram_init_data: str | None = Header(None)):
    admin_auth(x_telegram_init_data)
    ensure_contributions()
    with engine.connect() as db:
        rows = db.execute(text("""
            SELECT * FROM public.vvd_article_contributions
            ORDER BY CASE WHEN status='pending' THEN 0
                          WHEN status='revision' THEN 1 ELSE 2 END,
                     created_at DESC LIMIT 250
        """)).mappings().all()
    return {"submissions": [safe_submission(r, admin=True) for r in rows]}


class ReviewRequest(BaseModel):
    action: str = Field(pattern="^(save|approve|reject|revision)$")
    content: ContributionContent
    note: str = Field(default="", max_length=1000)


@router.post("/admin/{submission_id}/review")
def review_submission(
    submission_id: UUID,
    payload: ReviewRequest,
    x_telegram_init_data: str | None = Header(None)
):
    admin_auth(x_telegram_init_data)
    ensure_contributions()
    if payload.action in ("reject", "revision") and len(payload.note.strip()) < 4:
        raise HTTPException(422, "Укажите причину отклонения или доработки")
    check_category(payload.content.category_id)
    with engine.begin() as db:
        row = db.execute(text("""
            SELECT * FROM public.vvd_article_contributions
            WHERE id=CAST(:id AS uuid) FOR UPDATE
        """), {"id": str(submission_id)}).mappings().first()
        if not row:
            raise HTTPException(404, "Материал не найден")
        if row["status"] == "published":
            raise HTTPException(409, "Статья уже опубликована")
        if payload.action == "approve":
            current = db.execute(text("""
                SELECT version,content FROM public.vvd_editorial
                WHERE id=1 FOR UPDATE
            """)).mappings().one()
            editorial_data = dict(current["content"])
            if not any(c.get("id") == payload.content.category_id and c.get("active",True)
                       for c in editorial_data.get("categories", [])):
                raise HTTPException(422,"Категория недоступна")
            article_slug = "community-" + submission_id.hex
            if any(a["slug"] == article_slug for a in editorial_data["articles"]):
                raise HTTPException(409,"Такой адрес статьи уже существует")
            stamp = datetime.now(timezone.utc).isoformat()
            public_article = Article.model_validate({
                **payload.content.model_dump(exclude={"author_name","rights_confirmed"}),
                "author_name": payload.content.author_name,
                "slug": article_slug, "seo_title": payload.content.title,
                "seo_description": payload.content.excerpt[:300],
                "tags": [], "published": True,
                "show_on_web": True, "show_in_mini_app": True,
                "published_at": stamp, "updated_at": stamp
            }).model_dump()
            editorial_data["articles"] = list(editorial_data["articles"]) + [public_article]
            EditorialContent.model_validate(editorial_data)
            db.execute(text("""
                UPDATE public.vvd_editorial SET content=CAST(:body AS jsonb),
                version=version+1, updated_at=now() WHERE id=1
            """), {"body": json.dumps(editorial_data,ensure_ascii=False)})
            status = "published"
        else:
            article_slug = None
            status = {"save": row["status"], "reject": "rejected",
                      "revision": "revision"}[payload.action]
        db.execute(text("""
            UPDATE public.vvd_article_contributions
            SET edited=CAST(:edited AS jsonb),status=:status,
                moderator_note=:note,article_slug=:slug,updated_at=now()
            WHERE id=CAST(:id AS uuid)
        """), {"edited": json.dumps(payload.content.model_dump(),ensure_ascii=False),
               "status": status, "note": payload.note.strip(),
               "slug": article_slug, "id": str(submission_id)})
    return {"success": True, "status": status, "article_slug": article_slug}
