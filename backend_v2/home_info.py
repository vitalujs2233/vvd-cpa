"""Editable home information cards; independent of finance and CPA data."""
import uuid
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Header, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text
from database import engine
from home_ads import admin, sanitize, safe_target

router=APIRouter(prefix="/home-info",tags=["Home information blocks"])

def serialize(row):
    return {"id":str(row["id"]),"title":row["title"],"subtitle":row["subtitle"],
      "description":row["description"],"image_url":f"/home-info/images/{row['id']}" if row["has_image"] else None,
      "target_url":row["target_url"],"is_active":row["is_active"],"position":row["position"],
      "created_at":row["created_at"].isoformat(),"updated_at":row["updated_at"].isoformat()}

SELECT_FIELDS="id,title,subtitle,description,target_url,is_active,position,created_at,updated_at,(image_data IS NOT NULL) AS has_image"

@router.get("/published")
def published():
    with engine.connect() as conn:
        rows=conn.execute(text(f"SELECT {SELECT_FIELDS} FROM home_info_blocks WHERE is_active AND (length(trim(title))>0 OR length(trim(subtitle))>0 OR length(trim(description))>0 OR image_data IS NOT NULL) ORDER BY position,created_at")).mappings().all()
    return {"items":[serialize(row) for row in rows]}

@router.get("/images/{block_id}")
def image(block_id:uuid.UUID):
    with engine.connect() as conn:
        data=conn.execute(text("SELECT image_data FROM home_info_blocks WHERE id=:id"),{"id":str(block_id)}).scalar_one_or_none()
    if data is None:raise HTTPException(404,"Изображение не найдено")
    return Response(content=bytes(data),media_type="image/webp",headers={"Cache-Control":"public,max-age=300","X-Content-Type-Options":"nosniff"})

@router.get("/admin")
def list_admin(x_telegram_init_data:Optional[str]=Header(None)):
    admin(x_telegram_init_data)
    with engine.connect() as conn:
        rows=conn.execute(text(f"SELECT {SELECT_FIELDS} FROM home_info_blocks ORDER BY position,created_at")).mappings().all()
    return {"items":[serialize(row) for row in rows]}

class Block(BaseModel):
    title:str=Field(default="",max_length=180)
    subtitle:str=Field(default="",max_length=180)
    description:str=Field(default="",max_length=1200)
    target_url:str=Field(default="",max_length=2048)
    is_active:bool=False
    @field_validator("target_url")
    @classmethod
    def valid_target(cls,v):return safe_target(v)

@router.post("/admin/blocks")
def create(payload:Block,x_telegram_init_data:Optional[str]=Header(None)):
    admin(x_telegram_init_data)
    with engine.begin() as conn:
        conn.execute(text("SELECT id FROM home_info_blocks ORDER BY id FOR UPDATE"))
        position=conn.execute(text("SELECT COALESCE(MAX(position),-1)+1 FROM home_info_blocks")).scalar_one()
        ident=conn.execute(text("""INSERT INTO home_info_blocks(title,subtitle,description,target_url,is_active,position)
          VALUES(:title,:subtitle,:description,:target_url,:is_active,:position) RETURNING id"""),
          {**payload.model_dump(),"position":position}).scalar_one()
    return {"id":str(ident)}

@router.put("/admin/blocks/{block_id}")
def update(block_id:uuid.UUID,payload:Block,x_telegram_init_data:Optional[str]=Header(None)):
    admin(x_telegram_init_data)
    with engine.begin() as conn:
        changed=conn.execute(text("""UPDATE home_info_blocks SET title=:title,subtitle=:subtitle,
          description=:description,target_url=:target_url,is_active=:is_active,updated_at=now()
          WHERE id=:id RETURNING id"""),{**payload.model_dump(),"id":str(block_id)}).scalar_one_or_none()
    if changed is None:raise HTTPException(404,"Блок не найден")
    return {"ok":True}

@router.post("/admin/blocks/{block_id}/image")
async def upload_image(block_id:uuid.UUID,image:UploadFile=File(...),x_telegram_init_data:Optional[str]=Header(None)):
    admin(x_telegram_init_data)
    encoded=await sanitize(image)
    with engine.begin() as conn:
        changed=conn.execute(text("UPDATE home_info_blocks SET image_data=:data,updated_at=now() WHERE id=:id RETURNING id"),
          {"data":encoded,"id":str(block_id)}).scalar_one_or_none()
    if changed is None:raise HTTPException(404,"Блок не найден")
    return {"ok":True}

@router.delete("/admin/blocks/{block_id}/image")
def remove_image(block_id:uuid.UUID,x_telegram_init_data:Optional[str]=Header(None)):
    admin(x_telegram_init_data)
    with engine.begin() as conn:
        changed=conn.execute(text("UPDATE home_info_blocks SET image_data=NULL,updated_at=now() WHERE id=:id RETURNING id"),{"id":str(block_id)}).scalar_one_or_none()
    if changed is None:raise HTTPException(404,"Блок не найден")
    return {"ok":True}

@router.delete("/admin/blocks/{block_id}")
def delete(block_id:uuid.UUID,x_telegram_init_data:Optional[str]=Header(None)):
    admin(x_telegram_init_data)
    with engine.begin() as conn:
        changed=conn.execute(text("DELETE FROM home_info_blocks WHERE id=:id RETURNING id"),{"id":str(block_id)}).scalar_one_or_none()
    if changed is None:raise HTTPException(404,"Блок не найден")
    return {"ok":True}

class Reorder(BaseModel):
    ids:list[uuid.UUID]=Field(max_length=500)

@router.put("/admin/order")
def reorder(payload:Reorder,x_telegram_init_data:Optional[str]=Header(None)):
    admin(x_telegram_init_data)
    if len(set(payload.ids))!=len(payload.ids):raise HTTPException(422,"Повторяющиеся ID")
    with engine.begin() as conn:
        conn.execute(text("SELECT id FROM home_info_blocks ORDER BY id FOR UPDATE"))
        actual={str(v) for v in conn.execute(text("SELECT id FROM home_info_blocks")).scalars()}
        if actual!={str(v) for v in payload.ids}:raise HTTPException(409,"Список блоков изменился")
        for pos,ident in enumerate(payload.ids):
            conn.execute(text("UPDATE home_info_blocks SET position=:pos,updated_at=now() WHERE id=:id"),{"pos":pos,"id":str(ident)})
    return {"ok":True}
