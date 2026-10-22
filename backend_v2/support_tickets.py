"""Real private support tickets for the existing VVD CPA backend."""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import text
from database import engine
from stars_payments import verified_telegram_id, TelegramAuthError
from access_guard import authorized_admin

router = APIRouter()

class NewTicket(BaseModel):
    subject: str = Field(min_length=1, max_length=160)
    message: str = Field(min_length=1, max_length=4000)

class NewMessage(BaseModel):
    message: str = Field(min_length=1, max_length=4000)

class TicketStatus(BaseModel):
    status: str

def actor(request: Request) -> int:
    try:
        return verified_telegram_id(request.headers.get("X-Telegram-Init-Data", ""))
    except TelegramAuthError as exc:
        raise HTTPException(401, "Telegram authentication required") from exc

def require_admin(request: Request) -> int:
    uid = actor(request)
    if not authorized_admin(uid):
        raise HTTPException(403, "Administrator access required")
    return uid

def check_ticket(conn, ticket_id: int, uid: int, admin: bool = False):
    row = conn.execute(text("SELECT id, user_telegram_id, subject, status, created_at, updated_at FROM support_tickets WHERE id=:id"), {"id":ticket_id}).mappings().first()
    if not row:
        raise HTTPException(404, "Ticket not found")
    if not admin and int(row["user_telegram_id"]) != uid:
        raise HTTPException(404, "Ticket not found")
    return dict(row)

def ticket_messages(conn, ticket_id: int):
    rows = conn.execute(text("SELECT id, ticket_id, sender_role, body, created_at FROM support_ticket_messages WHERE ticket_id=:id ORDER BY id ASC LIMIT 500"), {"id":ticket_id}).mappings().all()
    return [dict(row) for row in rows]

@router.post("/support/tickets", status_code=201)
def create_ticket(data: NewTicket, request: Request):
    uid = actor(request)
    subject, body = data.subject.strip(), data.message.strip()
    if not subject or not body:
        raise HTTPException(422, "Subject and message required")
    with engine.begin() as conn:
        row = conn.execute(text("INSERT INTO support_tickets(user_telegram_id,subject) VALUES (:uid,:subject) RETURNING id"), {"uid":uid,"subject":subject}).first()
        ticket_id = row[0]
        conn.execute(text("INSERT INTO support_ticket_messages(ticket_id,sender_telegram_id,sender_role,body) VALUES (:id,:uid,'user',:body)"), {"id":ticket_id,"uid":uid,"body":body})
    return {"success": True, "ticket_id": ticket_id}

@router.get("/support/tickets")
def my_tickets(request: Request):
    uid = actor(request)
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT id, subject, status, created_at, updated_at FROM support_tickets WHERE user_telegram_id=:uid ORDER BY updated_at DESC LIMIT 100"), {"uid":uid}).mappings().all()
    return {"success":True,"tickets":[dict(r) for r in rows]}

@router.get("/support/tickets/{ticket_id}")
def my_ticket(ticket_id: int, request: Request):
    uid = actor(request)
    with engine.connect() as conn:
        ticket = check_ticket(conn,ticket_id,uid)
        messages = ticket_messages(conn,ticket_id)
    return {"success":True,"ticket":ticket,"messages":messages}

@router.post("/support/tickets/{ticket_id}/messages",status_code=201)
def post_user_message(ticket_id: int, data: NewMessage, request: Request):
    uid = actor(request)
    body = data.message.strip()
    if not body:
        raise HTTPException(422,"Message required")
    with engine.begin() as conn:
        ticket = check_ticket(conn,ticket_id,uid)
        if ticket["status"] != "open":
            raise HTTPException(409,"Ticket is closed")
        conn.execute(text("INSERT INTO support_ticket_messages(ticket_id,sender_telegram_id,sender_role,body) VALUES (:id,:uid,'user',:body)"),{"id":ticket_id,"uid":uid,"body":body})
        conn.execute(text("UPDATE support_tickets SET updated_at=now() WHERE id=:id"),{"id":ticket_id})
    return {"success":True}

@router.get("/admin/support/tickets")
def admin_tickets(request: Request):
    require_admin(request)
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT t.id,t.user_telegram_id,t.subject,t.status,t.created_at,t.updated_at,u.first_name,u.username FROM support_tickets t LEFT JOIN users u ON u.telegram_id=t.user_telegram_id ORDER BY (t.status='open') DESC,t.updated_at DESC LIMIT 200")).mappings().all()
    return {"success":True,"tickets":[dict(r) for r in rows]}

@router.get("/admin/support/tickets/{ticket_id}")
def admin_ticket(ticket_id: int,request: Request):
    uid=require_admin(request)
    with engine.connect() as conn:
        ticket=check_ticket(conn,ticket_id,uid,True)
        messages=ticket_messages(conn,ticket_id)
    return {"success":True,"ticket":ticket,"messages":messages}

@router.post("/admin/support/tickets/{ticket_id}/messages",status_code=201)
def admin_reply(ticket_id:int,data:NewMessage,request:Request):
    uid=require_admin(request)
    body=data.message.strip()
    if not body:
        raise HTTPException(422,"Message required")
    with engine.begin() as conn:
        ticket=check_ticket(conn,ticket_id,uid,True)
        if ticket["status"]!="open":
            raise HTTPException(409,"Ticket is closed")
        conn.execute(text("INSERT INTO support_ticket_messages(ticket_id,sender_telegram_id,sender_role,body) VALUES (:id,:uid,'admin',:body)"),{"id":ticket_id,"uid":uid,"body":body})
        conn.execute(text("UPDATE support_tickets SET updated_at=now() WHERE id=:id"),{"id":ticket_id})
    return {"success":True}

@router.patch("/admin/support/tickets/{ticket_id}/status")
def admin_status(ticket_id:int,data:TicketStatus,request:Request):
    uid=require_admin(request)
    if data.status not in ("open","closed"):
        raise HTTPException(422,"Invalid status")
    with engine.begin() as conn:
        check_ticket(conn,ticket_id,uid,True)
        conn.execute(text("UPDATE support_tickets SET status=:status,updated_at=now() WHERE id=:id"),{"id":ticket_id,"status":data.status})
    return {"success":True}
