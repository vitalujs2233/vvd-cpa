"""Versioned editorial content for VVD CPA. Admin paths protected by existing access_guard."""
import json
from fastapi import APIRouter, HTTPException, Request, UploadFile, File
from fastapi.responses import Response
from sqlalchemy import text
from database import engine
from stars_payments import verified_telegram_id
from access_guard import authorized_admin
from PIL import Image
from io import BytesIO
import uuid

router = APIRouter()
DEFAULT_TITLES = ["Кто мы?", "Почему выбирают VVD CPA?", "Выплаты партнёрам.", "Как начать работу?", "Часто задаваемые вопросы.", "Правила сотрудничества.", "Поддержка и сообщество."]
DEFAULT = [{"id": str(i), "title": t, "summary": "", "body": "", "icon": "info", "visible": True, "image": "", "buttons": []} for i,t in enumerate(DEFAULT_TITLES)]
def validate(data):
    if not isinstance(data, list) or len(data) > 60:
        raise HTTPException(422, "Invalid content list")
    ids = set()
    for item in data:
        if not isinstance(item,dict) or not isinstance(item.get("id"),str) or len(item["id"]) > 100 or item["id"] in ids:
            raise HTTPException(422, "Invalid section id")
        ids.add(item["id"])
        for field,limit in (("title",160),("summary",500),("body",30000),("icon",40),("image",500)):
            if not isinstance(item.get(field,""),str) or len(item.get(field,"")) > limit:
                raise HTTPException(422, "Invalid "+field)
        if not isinstance(item.get("visible",True),bool):
            raise HTTPException(422, "Invalid visibility")
        buttons=item.get("buttons",[])
        if not isinstance(buttons,list) or len(buttons)>10:
            raise HTTPException(422, "Invalid buttons")
        for b in buttons:
            if not isinstance(b,dict) or not isinstance(b.get("label"),str) or len(b["label"])>100 or not isinstance(b.get("url"),str) or len(b["url"])>1000:
                raise HTTPException(422, "Invalid button")
            url=b["url"]
            if not (url.startswith("https://") or url.startswith("/") and not url.startswith("//")):
                raise HTTPException(422, "Invalid link")
        image=item.get("image","")
        if image and not image.startswith("/info/image/"):
            raise HTTPException(422, "Invalid image")
    return data

@router.get("/info")
def published_info():
    with engine.connect() as c:
        row=c.execute(text("SELECT id,content FROM vvd_info_versions WHERE status='published' ORDER BY id DESC LIMIT 1")).mappings().first()
    data=row["content"] if row else DEFAULT
    return {"version":row["id"] if row else 0,"sections":[s for s in data if s.get("visible",True)]}

@router.get("/admin/info")
def admin_info():
    with engine.connect() as c:
        rows=c.execute(text("SELECT id,status,content,created_at,published_at FROM vvd_info_versions ORDER BY id DESC LIMIT 40")).mappings().all()
    return {"versions":[dict(r) for r in rows],"defaults":DEFAULT}

@router.post("/admin/info/draft")
async def save_draft(request:Request):
    uid=verified_telegram_id(request.headers.get("X-Telegram-Init-Data",""))
    if not authorized_admin(uid): raise HTTPException(403)
    data=validate((await request.json()).get("sections"))
    with engine.begin() as c:
        result=c.execute(text("INSERT INTO vvd_info_versions(status,content,created_by) VALUES ('draft',CAST(:content AS jsonb),:uid) RETURNING id"),{"content":json.dumps(data,ensure_ascii=False),"uid":uid}).scalar_one()
    return {"success":True,"id":result}

@router.post("/admin/info/publish/{version_id}")
def publish(version_id:int):
    with engine.begin() as c:
        draft=c.execute(text("SELECT content FROM vvd_info_versions WHERE id=:id AND status='draft' FOR UPDATE"),{"id":version_id}).scalar()
        if draft is None: raise HTTPException(404,"Draft not found")
        c.execute(text("UPDATE vvd_info_versions SET status='archived' WHERE status='published'"))
        c.execute(text("UPDATE vvd_info_versions SET status='published',published_at=now() WHERE id=:id"),{"id":version_id})
    return {"success":True}

@router.post("/admin/info/restore/{version_id}")
def restore(version_id:int,request:Request):
    uid=verified_telegram_id(request.headers.get("X-Telegram-Init-Data",""))
    with engine.begin() as c:
        previous=c.execute(text("SELECT content FROM vvd_info_versions WHERE id=:id AND status IN ('archived','published')"),{"id":version_id}).scalar()
        if previous is None: raise HTTPException(404,"Version not found")
        c.execute(text("UPDATE vvd_info_versions SET status='archived' WHERE status='published'"))
        new_id=c.execute(text("INSERT INTO vvd_info_versions(status,content,created_by,published_at) VALUES ('published',CAST(:content AS jsonb),:uid,now()) RETURNING id"),{"content":json.dumps(previous,ensure_ascii=False),"uid":uid}).scalar_one()
    return {"success":True,"id":new_id}
