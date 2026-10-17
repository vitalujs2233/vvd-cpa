"""CPA catalog stage 2: existing offers, new networks and vertical metadata.

All admin writes require verified Telegram initData and server-side admin role.
This module deliberately does not modify /go, /smartlink or postbacks.
"""
import ipaddress
import re
from decimal import Decimal
from urllib.parse import urlsplit
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from database import engine
from neutral_links import PARAM_RE, _validated_destination
from stars_payments import require_telegram_id
from access_guard import authorized_admin

router=APIRouter(prefix="/cpa",tags=["CPA catalog"])

def require_admin(raw):
    uid=require_telegram_id(raw)
    if not authorized_admin(uid):
        raise HTTPException(status_code=403,detail="Administrator access required")
    return uid

def safe_url(url):
    if not url:return None
    u=urlsplit(url.strip())
    if u.scheme!="https" or not u.hostname or u.username or u.password or u.fragment:
        raise ValueError("Разрешены только безопасные HTTPS-адреса")
    host=u.hostname.lower()
    if host in ("localhost",) or host.endswith((".local",".internal",".localhost")):
        raise ValueError("Недопустимый адрес")
    try:
        addr=ipaddress.ip_address(host.strip("[]"))
        if not addr.is_global:raise ValueError("Внутренний адрес запрещён")
    except ValueError as err:
        if "запрещён" in str(err):raise
    if u.port and u.port not in (443,8443):raise ValueError("Небезопасный порт")
    return url.strip()

class NetworkIn(BaseModel):
    name:str=Field(min_length=2,max_length=120)
    website:str|None=None
    description:str=Field("",max_length=2000)
    is_active:bool=True
    connection_notes:str=Field("",max_length=2000)
    click_param:str|None=None
    @field_validator('click_param')
    @classmethod
    def click_parameter(cls,v):
        if v and not PARAM_RE.fullmatch(v):
            raise ValueError('Некорректное имя параметра клика')
        return v or None
    @field_validator("website")
    @classmethod
    def url(cls,v):
        return safe_url(v) if v else None

class VerticalIn(BaseModel):
    slug:str=Field(pattern=r"^[a-z0-9][a-z0-9-]{1,78}$")
    title:str=Field(min_length=2,max_length=120)
    description:str=Field("",max_length=2000)
    icon_name:str=Field("layers",pattern=r"^(layers|heart|sparkles|video|gamepad|smartphone|globe)$")
    display_order:int=Field(0,ge=-9999,le=9999)
    is_active:bool=False
    cpa_link_allowed:bool=False

class OfferIn(BaseModel):
    id:str=Field(min_length=2,max_length=80,pattern=r"^[a-zA-Z0-9][a-zA-Z0-9_-]*$")
    title:str=Field(min_length=2,max_length=200)
    vertical_slug:str
    network_id:int|None=None
    description:str=Field("",max_length=5000)
    icon_name:str=Field("layers",max_length=30)
    image_url:str|None=None
    offer_type:str=Field("offer",pattern=r"^(offer|smartlink)$")
    source_url:str|None=None
    geo:str=Field("",max_length=300)
    traffic_restrictions:str=Field("",max_length=2000)
    payment_model:str=Field("CPA",max_length=30)
    currency:str=Field("USD",pattern=r"^[A-Z]{3}$")
    payout_terms:str=Field("",max_length=1000)
    status:str=Field("draft",pattern=r"^(draft|published|disabled)$")
    display_order:int=Field(0,ge=-9999,le=9999)
    commission_percent:Decimal=Field(Decimal("20"),ge=0,le=100)
    hold_override_days:int=Field(10,ge=0,le=365)
    click_param_override:str|None=None
    @field_validator('click_param_override')
    @classmethod
    def click_parameter(cls,v):
        if v and not PARAM_RE.fullmatch(v):
            raise ValueError('Некорректное имя параметра клика')
        return v or None
    @field_validator("source_url","image_url")
    @classmethod
    def url(cls,v):
        return safe_url(v) if v else None

@router.get("/catalog")
def catalog():
    with engine.connect() as conn:
        verticals=conn.execute(text("""SELECT v.slug,v.title,v.description,v.icon_name,
           COUNT(o.id) FILTER (WHERE o.status='published' AND (n.is_active OR o.network_id IS NULL)) AS offers_count
           FROM cpa_verticals v LEFT JOIN offers o ON o.vertical_slug=v.slug
           LEFT JOIN cpa_networks n ON n.id=o.network_id
           WHERE v.is_active=true GROUP BY v.slug ORDER BY v.display_order,v.title""")).mappings().all()
    return {"verticals":[dict(x) for x in verticals]}

@router.get("/catalog/{slug}")
def public_vertical(slug:str):
    with engine.connect() as conn:
        vertical=conn.execute(text("SELECT slug,title,description,icon_name FROM cpa_verticals WHERE slug=:slug AND is_active=true"),
                              {"slug":slug}).mappings().first()
        if not vertical:raise HTTPException(404,"Вертикаль недоступна")
        offers=conn.execute(text("""SELECT o.id,o.title,o.description,o.icon_name,o.image_url,o.offer_type,
          o.geo,o.traffic_restrictions,o.payment_model,o.currency,o.payout_terms,
          o.hold_override_days,o.status FROM offers o LEFT JOIN cpa_networks n ON n.id=o.network_id
          WHERE o.vertical_slug=:slug AND o.status='published' AND (n.is_active OR o.network_id IS NULL)
          ORDER BY o.display_order,o.title"""),{"slug":slug}).mappings().all()
    return {"vertical":dict(vertical),"offers":[dict(x) for x in offers]}

@router.get("/catalog/{slug}/{offer_id}")
def public_offer(slug:str,offer_id:str):
    data=public_vertical(slug)
    for item in data["offers"]:
        if item["id"]==offer_id:return {"offer":item,"vertical":data["vertical"]}
    raise HTTPException(404,"Оффер недоступен")

@router.get("/admin/networks")
def networks(x_telegram_init_data:str|None=Header(None)):
    require_admin(x_telegram_init_data)
    with engine.connect() as conn:
        rows=conn.execute(text("""SELECT n.id,n.name,n.website,n.description,n.is_active,n.connection_notes,n.click_param,
             COUNT(o.id) AS offers_count FROM cpa_networks n LEFT JOIN offers o ON o.network_id=n.id
             GROUP BY n.id ORDER BY n.name""")).mappings().all()
    return {"items":[dict(x) for x in rows]}

@router.post("/admin/networks")
def create_network(payload:NetworkIn,x_telegram_init_data:str|None=Header(None)):
    require_admin(x_telegram_init_data)
    try:
        with engine.begin() as conn:
            row=conn.execute(text("""INSERT INTO cpa_networks(name,website,description,is_active,connection_notes,click_param)
            VALUES(:name,:website,:description,:is_active,:connection_notes,:click_param) RETURNING id"""),payload.model_dump()).scalar_one()
    except IntegrityError:
        raise HTTPException(409,"Партнёрская сеть с таким названием уже существует")
    return {"id":row}

@router.put("/admin/networks/{network_id}")
def edit_network(network_id:int,payload:NetworkIn,x_telegram_init_data:str|None=Header(None)):
    require_admin(x_telegram_init_data)
    with engine.begin() as conn:
        row=conn.execute(text("""UPDATE cpa_networks SET name=:name,website=:website,
          description=:description,is_active=:is_active,connection_notes=:connection_notes,click_param=:click_param
          WHERE id=:id RETURNING id"""),{**payload.model_dump(),"id":network_id}).first()
    if not row:raise HTTPException(404,"Сеть не найдена")
    return {"ok":True}

@router.get("/admin/verticals")
def verticals(x_telegram_init_data:str|None=Header(None)):
    require_admin(x_telegram_init_data)
    with engine.connect() as conn:
        rows=conn.execute(text("""SELECT v.*,COUNT(o.id) AS offers_count FROM cpa_verticals v
        LEFT JOIN offers o ON o.vertical_slug=v.slug GROUP BY v.slug
        ORDER BY v.display_order,v.title""")).mappings().all()
    return {"items":[dict(x) for x in rows]}

@router.post("/admin/verticals")
def create_vertical(payload:VerticalIn,x_telegram_init_data:str|None=Header(None)):
    require_admin(x_telegram_init_data)
    try:
        with engine.begin() as conn:
            conn.execute(text("""INSERT INTO cpa_verticals(slug,title,description,icon_name,display_order,is_active,cpa_link_allowed)
             VALUES(:slug,:title,:description,:icon_name,:display_order,:is_active,:cpa_link_allowed)"""),payload.model_dump())
    except IntegrityError:
        raise HTTPException(409,"Вертикаль с таким адресом уже существует")
    return {"ok":True}

@router.put("/admin/verticals/{slug}")
def edit_vertical(slug:str,payload:VerticalIn,x_telegram_init_data:str|None=Header(None)):
    require_admin(x_telegram_init_data)
    if slug!=payload.slug:raise HTTPException(422,"Идентификатор вертикали не изменяется")
    with engine.begin() as conn:
        row=conn.execute(text("""UPDATE cpa_verticals SET title=:title,description=:description,
           icon_name=:icon_name,display_order=:display_order,is_active=:is_active,
           cpa_link_allowed=:cpa_link_allowed WHERE slug=:slug RETURNING slug"""),payload.model_dump()).first()
    if not row:raise HTTPException(404,"Вертикаль не найдена")
    return {"ok":True}

@router.get("/admin/offers")
def offers_admin(x_telegram_init_data:str|None=Header(None)):
    require_admin(x_telegram_init_data)
    with engine.connect() as conn:
        rows=conn.execute(text("""SELECT id,title,vertical_slug,network_id,description,icon_name,image_url,
         offer_type,source_url,geo,traffic_restrictions,payment_model,currency,payout_terms,click_param_override,
         status,display_order,commission_percent,hold_override_days
         FROM offers ORDER BY display_order,title""")).mappings().all()
    return {"items":[{**dict(x),"commission_percent":str(x["commission_percent"])} for x in rows]}

def checked_offer(conn,payload):
    if payload.status=='published' and payload.source_url:
        selected=payload.click_param_override
        if not selected and payload.network_id:
            selected=conn.execute(text('SELECT click_param FROM cpa_networks WHERE id=:id'),{'id':payload.network_id}).scalar()
        if selected:
            _validated_destination(payload.source_url,selected,'configuration-check')
    if payload.status == "published" and payload.offer_type == "smartlink":
        authorized=conn.execute(text("SELECT is_active AND cpa_link_allowed FROM cpa_verticals WHERE slug=:slug"),{"slug":payload.vertical_slug}).scalar()
        if authorized is not True:
            raise HTTPException(422,"Вертикаль не разрешена для CPA-переходов")
        if not payload.source_url:
            raise HTTPException(422, "Для публикации Smartlink укажите действующую исходную HTTPS-ссылку")
        if not payload.network_id:
            raise HTTPException(422, "Выберите партнёрскую сеть перед публикацией")
        ready=conn.execute(text("SELECT is_active FROM cpa_networks WHERE id=:id"),{"id":payload.network_id}).scalar()
        if ready is not True:
            raise HTTPException(422, "Сначала включите настроенную партнёрскую сеть")
    if not conn.execute(text("SELECT 1 FROM cpa_verticals WHERE slug=:s"),{"s":payload.vertical_slug}).first():
        raise HTTPException(422,"Сначала создайте вертикаль")
    if payload.network_id and not conn.execute(text("SELECT 1 FROM cpa_networks WHERE id=:id"),{"id":payload.network_id}).first():
        raise HTTPException(422,"Партнёрская сеть не найдена")

@router.post("/admin/offers")
def create_offer(payload:OfferIn,x_telegram_init_data:str|None=Header(None)):
    require_admin(x_telegram_init_data)
    try:
        with engine.begin() as conn:
            checked_offer(conn,payload)
            conn.execute(text("""INSERT INTO offers(id,smartlink_suffix,title,vertical_slug,network_id,description,icon_name,
              image_url,offer_type,source_url,geo,traffic_restrictions,payment_model,currency,
              payout_terms,status,display_order,commission_percent,hold_override_days,click_param_override)
              VALUES(:id,'cpa-' || :id,:title,:vertical_slug,:network_id,:description,:icon_name,:image_url,
              :offer_type,:source_url,:geo,:traffic_restrictions,:payment_model,:currency,
               :payout_terms,:status,:display_order,:commission_percent,:hold_override_days,:click_param_override)"""),
              payload.model_dump())
    except IntegrityError as exc:
        constraint=getattr(getattr(exc.orig,"diag",None),"constraint_name",None)
        if constraint=="offers_pkey":
            raise HTTPException(409,"Предложение с таким ID уже существует") from exc
        if constraint=="offers_smartlink_suffix_key":
            raise HTTPException(409,"Конфликт технического идентификатора ссылки") from exc
        if constraint in ("offers_network_id_fkey","offers_vertical_slug_fkey"):
            raise HTTPException(422,"Выбранная сеть или вертикаль недоступна") from exc
        # Do not mislabel unrelated NOT NULL / check / other constraints as ID conflicts.
        raise HTTPException(500,"Не удалось сохранить предложение. Проверьте обязательные поля") from exc
    return {"ok":True}

@router.put("/admin/offers/{offer_id}")
def edit_offer(offer_id:str,payload:OfferIn,x_telegram_init_data:str|None=Header(None)):
    require_admin(x_telegram_init_data)
    if offer_id!=payload.id:raise HTTPException(422,"ID оффера не изменяется")
    with engine.begin() as conn:
        checked_offer(conn,payload)
        result=conn.execute(text("""UPDATE offers SET title=:title,vertical_slug=:vertical_slug,
          network_id=:network_id,description=:description,icon_name=:icon_name,image_url=:image_url,
          offer_type=:offer_type,source_url=:source_url,geo=:geo,
          traffic_restrictions=:traffic_restrictions,payment_model=:payment_model,
          currency=:currency,payout_terms=:payout_terms,status=:status,
          display_order=:display_order,commission_percent=:commission_percent,
          hold_override_days=:hold_override_days,click_param_override=:click_param_override,updated_at=now() WHERE id=:id RETURNING id"""),
          payload.model_dump()).first()
    if not result:raise HTTPException(404,"Оффер не найден")
    return {"ok":True}
