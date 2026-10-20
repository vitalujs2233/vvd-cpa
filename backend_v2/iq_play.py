"""VVD IQ Play isolated game API. All scoring and clocks are authoritative on server."""
import uuid
import json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text

from database import engine
from stars_payments import require_telegram_id

router = APIRouter(prefix="/iq-play", tags=["IQ Play"])
LEAGUES = ("Новичок", "Исследователь", "Практик", "Эксперт", "Мастер", "Легенда")


def level_for(xp: int) -> int:
    level = 1
    while level < 30 and xp >= 150 * level * level + 250 * level:
        level += 1
    return level


def seconds_for(position: int) -> int:
    return 30 if position < 3 else 25 if position < 9 else 20


def user_id(header: str | None) -> int:
    return require_telegram_id(header)


def profile(conn, uid: int):
    p = conn.execute(text("SELECT xp,games,wins,best_correct FROM iq_progress WHERE user_id=:u"), {"u": uid}).mappings().first()
    p = dict(p) if p else {"xp": 0, "games": 0, "wins": 0, "best_correct": 0}
    level = level_for(p["xp"])
    badges = conn.execute(text("SELECT code FROM iq_user_achievements WHERE user_id=:u"), {"u": uid}).scalars().all()
    return {**p, "level": level, "league": LEAGUES[(level-1)//5], "achievements": badges}


def current(conn, row):
    result = {"round_id": str(row["id"]), "status": row["status"],
              "position": row["question_index"] + 1, "correct_count": row["correct_count"],
              "round_xp": row["xp"], "retry": row["retry"], "server_now": datetime.now(timezone.utc).isoformat()}
    if row["status"] == "active":
        q = conn.execute(text("SELECT prompt,options FROM iq_round_questions WHERE round_id=:r AND position=:p"),
                         {"r": row["id"], "p": row["question_index"]}).mappings().one()
        result.update({"prompt": q["prompt"], "options": q["options"], "blocked_index": row["blocked_index"],
                       "deadline": row["deadline"].isoformat(), "seconds": seconds_for(row["question_index"])})
    return result


@router.get("/profile")
def get_profile(x_telegram_init_data: str | None = Header(default=None)):
    uid = user_id(x_telegram_init_data)
    with engine.connect() as conn:
        return profile(conn, uid)


@router.get("/rounds/active")
def active_round(x_telegram_init_data: str | None = Header(default=None)):
    uid = user_id(x_telegram_init_data)
    with engine.connect() as conn:
        row = conn.execute(text("SELECT * FROM iq_rounds WHERE user_id=:u AND status='active'"),
                           {"u": uid}).mappings().first()
        return current(conn, row) if row else None


@router.post("/rounds")
def start_round(x_telegram_init_data: str | None = Header(default=None)):
    uid = user_id(x_telegram_init_data)
    with engine.begin() as conn:
        # Serialize starts per user even when no round exists yet.
        if not conn.execute(text("SELECT 1 FROM users WHERE telegram_id=:u FOR UPDATE"), {"u": uid}).first():
            raise HTTPException(404, "account_not_found")
        existing = conn.execute(text("SELECT * FROM iq_rounds WHERE user_id=:u AND status='active'"),
                                {"u": uid}).mappings().first()
        if existing:
            return current(conn, existing)
        questions = conn.execute(text("""
            SELECT id,version,prompt,options,correct_index FROM iq_questions
            WHERE enabled=TRUE AND id NOT IN
                (SELECT question_id FROM iq_seen_questions WHERE user_id=:u)
            ORDER BY random() LIMIT 15
        """), {"u": uid}).mappings().all()
        if len(questions) < 15:
            # Reset exposure cycle only when the unseen pool is insufficient.
            conn.execute(text("DELETE FROM iq_seen_questions WHERE user_id=:u"), {"u": uid})
            questions = conn.execute(text("""
                SELECT id,version,prompt,options,correct_index FROM iq_questions
                WHERE enabled=TRUE ORDER BY random() LIMIT 15
            """)).mappings().all()
        if len(questions) < 15:
            raise HTTPException(503, "question_pool_not_ready")
        rid = uuid.uuid4()
        deadline = datetime.now(timezone.utc) + timedelta(seconds=30)
        conn.execute(text("""
            INSERT INTO iq_rounds(id,user_id,deadline) VALUES (:r,:u,:d)
        """), {"r": rid, "u": uid, "d": deadline})
        for i, q in enumerate(questions):
            conn.execute(text("""
                INSERT INTO iq_round_questions(round_id,position,question_id,question_version,prompt,options,correct_index)
                VALUES (:r,:p,:id,:v,:prompt,CAST(:options AS jsonb),:correct)
            """), {"r": rid, "p": i, "id": q["id"], "v": q["version"], "prompt": q["prompt"],
                   "options": json.dumps(q["options"], ensure_ascii=False), "correct": q["correct_index"]})
            conn.execute(text("""
                INSERT INTO iq_seen_questions(user_id,question_id) VALUES (:u,:id) ON CONFLICT DO NOTHING
            """), {"u": uid, "id": q["id"]})
        row = conn.execute(text("SELECT * FROM iq_rounds WHERE id=:r"), {"r": rid}).mappings().one()
        return current(conn, row)


class Answer(BaseModel):
    choice: int = Field(ge=0, le=3)
    event_id: uuid.UUID


def finish(conn, row, won: bool, xp: int, correct: int):
    uid = row["user_id"]
    conn.execute(text("""
        UPDATE iq_rounds SET status=:s, xp=:xp, correct_count=:correct,finished_at=now()
        WHERE id=:r
    """), {"s": "won" if won else "lost", "xp": xp, "correct": correct, "r": row["id"]})
    conn.execute(text("""
        INSERT INTO iq_progress(user_id,xp,games,wins,best_correct)
        VALUES (:u,:xp,1,:wins,:correct)
        ON CONFLICT(user_id) DO UPDATE SET xp=iq_progress.xp+EXCLUDED.xp,
        games=iq_progress.games+1,wins=iq_progress.wins+EXCLUDED.wins,
        best_correct=GREATEST(iq_progress.best_correct,EXCLUDED.best_correct),updated_at=now()
    """), {"u": uid, "xp": xp, "wins": int(won), "correct": correct})
    stats = profile(conn, uid)
    codes = []
    if correct >= 1: codes.append("first_correct")
    if won:
        codes.append("first_win")
        codes.append("survivor" if row["used_retry"] else "flawless")
    if stats["games"] >= 10: codes.append("ten_games")
    if stats["wins"] >= 5: codes.append("five_wins")
    if stats["level"] >= 10: codes.append("level_ten")
    for code in codes:
        conn.execute(text("""
            INSERT INTO iq_user_achievements(user_id,code) VALUES (:u,:c) ON CONFLICT DO NOTHING
        """), {"u": uid, "c": code})


@router.post("/rounds/{round_id}/answers")
def submit(round_id: uuid.UUID, answer: Answer, x_telegram_init_data: str | None = Header(default=None)):
    uid = user_id(x_telegram_init_data)
    with engine.begin() as conn:
        row = conn.execute(text("SELECT * FROM iq_rounds WHERE id=:r AND user_id=:u FOR UPDATE"),
                           {"r": round_id, "u": uid}).mappings().first()
        if not row:
            raise HTTPException(404, "round_not_found")
        previous = conn.execute(text("SELECT result FROM iq_answer_events WHERE id=:e AND round_id=:r"),
                                {"e": answer.event_id, "r": round_id}).scalar()
        if previous is not None:
            return {"outcome": previous, "round": current(conn, row)}
        if row["status"] != "active":
            return {"outcome": "finished", "round": current(conn, row)}
        if row["retry"] and row["blocked_index"] == answer.choice:
            raise HTTPException(409, "option_blocked")
        q = conn.execute(text("SELECT correct_index FROM iq_round_questions WHERE round_id=:r AND position=:p"),
                         {"r": round_id, "p": row["question_index"]}).mappings().one()
        now = datetime.now(timezone.utc)
        expired = now > row["deadline"]
        correct = not expired and answer.choice == q["correct_index"]
        gained = 50 if row["retry"] else 100
        outcome = "correct" if correct else "wrong"
        if correct:
            next_position = row["question_index"] + 1
            won = next_position == 15
            xp = row["xp"] + gained + (300 if won else 0)
            if won:
                finish(conn, row, True, xp, row["correct_count"] + 1)
            else:
                conn.execute(text("""
                    UPDATE iq_rounds SET question_index=:p,retry=FALSE,blocked_index=NULL,
                    deadline=:d,xp=:xp,correct_count=correct_count+1 WHERE id=:r
                """), {"p": next_position, "d": now + timedelta(seconds=seconds_for(next_position)),
                       "xp": xp, "r": round_id})
        elif row["retry"]:
            finish(conn, row, False, row["xp"], row["correct_count"])
        else:
            # A timed-out first attempt gets the same 10s retry; choice is blocked only
            # when it was actually submitted before the first deadline.
            conn.execute(text("""
                UPDATE iq_rounds SET retry=TRUE,used_retry=TRUE,blocked_index=:b,deadline=:d WHERE id=:r
            """), {"b": None if expired else answer.choice,
                   "d": now + timedelta(seconds=10), "r": round_id})
        conn.execute(text("""
            INSERT INTO iq_answer_events(id,round_id,position,choice,result,xp_awarded)
            VALUES (:e,:r,:p,:c,:o,:xp)
        """), {"e": answer.event_id, "r": round_id, "p": row["question_index"], "c": answer.choice,
               "o": outcome, "xp": gained if correct else 0})
        updated = conn.execute(text("SELECT * FROM iq_rounds WHERE id=:r"), {"r": round_id}).mappings().one()
        return {"outcome": outcome, "round": current(conn, updated)}
