"""Read-only Stage 6 analytics for the existing VVD CPA Analysis page.

Never creates ledger entries, modifies balances, or activates the finance epoch.
Legacy statistics and historical conversions are deliberately separate.
"""
from datetime import date, timedelta
from decimal import Decimal
from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import text
from database import engine

router = APIRouter(tags=["CPA Analytics"])
ZERO = Decimal("0.00")
FINAL = {"approved", "rejected"}


def bounds(period="all", date_from=None, date_to=None):
    if period not in ("today", "yesterday", "7days", "30days", "all"):
        raise HTTPException(422, "Unknown period")
    now = date.today()
    start = {"today": now, "yesterday": now - timedelta(days=1),
             "7days": now - timedelta(days=6),
             "30days": now - timedelta(days=29), "all": None}[period]
    end = now - timedelta(days=1) if period == "yesterday" else now if period != "all" else None
    if date_from:
        start = max(start, date_from) if start else date_from
    if date_to:
        end = min(end, date_to) if end else date_to
    return start, end


def arguments(period, date_from, date_to, vertical, offer_id, network_id):
    start, end = bounds(period, date_from, date_to)
    return {"start": start, "end": end, "vertical": vertical or None,
            "offer": offer_id or None, "network": network_id}


# All conversion classifications are mutually exclusive; numeric 1/2/3
# are legacy historical statuses, NEVER eligibility for real finance.
STATE = """CASE WHEN v.status='approved' THEN 'approved'
              WHEN v.status='rejected' THEN 'rejected'
              WHEN v.status='pending' THEN 'pending'
              WHEN v.status IN ('1','2','3') THEN 'legacy'
              ELSE 'unknown' END"""
REAL = """v.is_test=FALSE AND e.activated_at IS NOT NULL
          AND v.finance_eligible_at IS NOT NULL
          AND v.finance_eligible_at>=e.activated_at
          AND v.created_at>=e.activated_at
          AND v.currency='USD'"""
# Separate click & conversion aggregation avoids multiplying clicks for
# multi-postback conversion records. Filtering is parameterized throughout.
CLICK_ROWS = """
 SELECT k.id,k.user_id,k.click_id,k.created_at::date AS event_date,
        k.offer_id,k.network_id,k.vertical,k.country_code,k.country_name
 FROM public.clicks k
 WHERE (:uid IS NULL OR k.user_id=:uid)
 AND (:start IS NULL OR k.created_at::date>=:start)
 AND (:end IS NULL OR k.created_at::date<=:end)
 AND (:vertical IS NULL OR k.vertical=:vertical)
 AND (:offer IS NULL OR k.offer_id=:offer)
 AND (:network IS NULL OR k.network_id=:network)
"""
CONVERSION_ROWS = """
 SELECT v.id,v.user_id,v.click_id,v.created_at::date AS event_date,
        v.offer_id,v.network_id,v.vertical_slug,v.is_test,v.status,
        v.finance_eligible_at,v.finance_approved_at,v.currency,v.payout_gross,
        v.payout_net,
        """ + STATE + """ AS normalized_status,
        CASE WHEN """ + REAL + """ THEN TRUE ELSE FALSE END AS is_real
 FROM public.conversions v CROSS JOIN public.cpa_finance_epoch e
 WHERE e.id=1 AND (:uid IS NULL OR v.user_id=:uid)
 AND (:start IS NULL OR v.created_at::date>=:start)
 AND (:end IS NULL OR v.created_at::date<=:end)
 AND (:vertical IS NULL OR v.vertical_slug=:vertical)
 AND (:offer IS NULL OR v.offer_id=:offer)
 AND (:network IS NULL OR v.network_id=:network)
"""


def scalar(value):
    return float(value or ZERO)


def summarize(conn, uid, params):
    bind = {**params, "uid": uid}
    clicks = conn.execute(text("SELECT count(*) FROM ("+CLICK_ROWS+") k"), bind).scalar_one()
    conv = conn.execute(text("SELECT normalized_status,is_test,is_real,status,id FROM ("+CONVERSION_ROWS+") v"), bind).mappings().all()
    ids = [row["id"] for row in conv if row["is_real"]]
    finance = {"gross": ZERO, "fee": ZERO, "partner": ZERO,
               "hold": ZERO, "released": ZERO, "real_withdrawable": ZERO}
    if ids:
        ledger = conn.execute(text("""
          SELECT l.conversion_id,l.operation_type,l.hold_delta,l.balance_delta,
                 l.platform_fee_delta
          FROM public.cpa_ledger l WHERE l.conversion_id=ANY(:ids)
        """), {"ids": ids}).mappings().all()
        approved = {row["id"] for row in conv if row["is_real"] and row["status"]=="approved"}
        totals = conn.execute(text("""
          SELECT COALESCE(SUM(payout_gross),0) gross FROM public.conversions
          WHERE id=ANY(:ids) AND status='approved'
        """), {"ids": list(approved)}).one()
        # Gross is recognized only when a finance hold credit is actually posted.
        recognized = {r["conversion_id"] for r in ledger if r["operation_type"]=="hold_credit"}
        finance["gross"] = sum((Decimal(str(row["payout_gross"])) for row in conn.execute(text("SELECT id,payout_gross FROM public.conversions WHERE id=ANY(:ids)"),{"ids":list(recognized)}).mappings()), ZERO)
        # Finance earnings only from actual ledger events, never assumed based on approvals.
        finance["partner"] = sum((row["hold_delta"] for row in ledger if row["operation_type"]=="hold_credit"), ZERO)
        finance["fee"] = sum((row["platform_fee_delta"] for row in ledger if row["operation_type"]=="platform_fee_accrual"), ZERO)
        finance["hold"] = sum((row["hold_delta"] for row in ledger), ZERO)
        finance["released"] = sum((row["balance_delta"] for row in ledger if row["operation_type"] in ("hold_release","manual_hold_release")), ZERO)
    if uid is not None:
        # Respect the stage 5 real finance entitlement, including reservations and
        # verified funding. Do not use the legacy user.balance column.
        from cpa_real_withdrawals import finance_balance_projection
        old = conn.execute(text("SELECT balance FROM public.users WHERE telegram_id=:uid"),
                           {"uid":uid}).scalar()
        if old is not None:
            finance["real_withdrawable"] = Decimal(str(finance_balance_projection(conn,uid,old)["real_withdrawable"]))
    statuses = {s:sum(1 for row in conv if row["normalized_status"]==s)
                for s in ("pending","approved","rejected","legacy","unknown")}
    count = sum(statuses[x] for x in ("pending","approved","rejected"))
    # Real EPC never uses the historic/demo earnings.
    return {"clicks":int(clicks),"conversions":count,"statuses":statuses,
            "cr":round(100*count/clicks,2) if clicks else 0.0,
            "epc":scalar(finance["released"] / clicks) if clicks else 0.0,
            "finance":{key:scalar(value) for key,value in finance.items()},
            "legacy_conversions":statuses["legacy"],"test_conversions":sum(bool(row["is_test"]) for row in conv),
            "historical_income_included":False}


def daily(conn, uid, params):
    bind={**params,"uid":uid}
    rows=conn.execute(text("""
      WITH c AS (SELECT event_date,count(*) clicks FROM ("""+CLICK_ROWS+""") x GROUP BY event_date),
           v AS (SELECT event_date,
                     count(*) FILTER(WHERE normalized_status IN ('pending','approved','rejected')) conversions,
                     count(*) FILTER(WHERE normalized_status='pending') pending,
                     count(*) FILTER(WHERE normalized_status='approved') approved,
                     count(*) FILTER(WHERE normalized_status='rejected') rejected
                 FROM ("""+CONVERSION_ROWS+""") x GROUP BY event_date)
      SELECT COALESCE(c.event_date,v.event_date) day,COALESCE(c.clicks,0) clicks,
             COALESCE(v.conversions,0) conversions,COALESCE(v.pending,0) pending,
             COALESCE(v.approved,0) approved,COALESCE(v.rejected,0) rejected
      FROM c FULL JOIN v ON c.event_date=v.event_date ORDER BY day
    """),bind).mappings().all()
    return [{"date":str(r["day"]),"clicks":r["clicks"],
             "conversions":r["conversions"],"pending":r["pending"],
             "approved":r["approved"],"rejected":r["rejected"],"income":0.0}
            for r in rows]


def grouped(conn, uid, params, field):
    fields={
      "offers":("offer_id","public.offers","id","title"),
      "networks":("network_id","public.cpa_networks","id","name"),
      "partners":("user_id","public.users","telegram_id","partner_code")
    }
    if field not in fields: raise ValueError("Unsupported grouping")
    key,table,id_column,title_column=fields[field]
    bind={**params,"uid":uid}
    rows=conn.execute(text("""
      WITH c AS (SELECT """+key+""" AS k,count(*) clicks FROM ("""+CLICK_ROWS+""") x GROUP BY k),
           v AS (SELECT """+key+""" AS k,
              count(*) FILTER(WHERE normalized_status IN ('pending','approved','rejected')) conversions,
              count(*) FILTER(WHERE normalized_status='approved') approved,
              count(*) FILTER(WHERE normalized_status='pending') pending,
              count(*) FILTER(WHERE normalized_status='rejected') rejected
              FROM ("""+CONVERSION_ROWS+""") x GROUP BY k)
      SELECT COALESCE(c.k,v.k) AS item_id,t."""+title_column+""" label,
         COALESCE(c.clicks,0) clicks,COALESCE(v.conversions,0) conversions,
         COALESCE(v.pending,0) pending,COALESCE(v.approved,0) approved,
         COALESCE(v.rejected,0) rejected
      FROM c FULL JOIN v ON c.k=v.k
      LEFT JOIN """+table+""" t ON t."""+id_column+"""=COALESCE(c.k,v.k)
      ORDER BY clicks DESC,item_id NULLS LAST
    """),bind).mappings().all()
    return [{"id":str(r["item_id"]) if r["item_id"] is not None else None,
             "label":r["label"] or "Не указан",
             "clicks":r["clicks"],"conversions":r["conversions"],
             "pending":r["pending"],"approved":r["approved"],"rejected":r["rejected"],
             "cr":round(100*r["conversions"]/r["clicks"],2) if r["clicks"] else 0}
            for r in rows]


def countries(conn, uid, params):
    # Blank/unknown country is NOT a geographic fact; exclude it.
    bind={**params,"uid":uid}
    rows=conn.execute(text("""
      WITH c AS (SELECT NULLIF(trim(country_code),'') code,
           max(NULLIF(trim(country_name),'')) name,count(*) clicks
           FROM ("""+CLICK_ROWS+""") x
           WHERE country_code IS NOT NULL AND trim(country_code) <> ''
             AND upper(country_code) NOT IN ('XX','ZZ','UNKNOWN','--')
           GROUP BY NULLIF(trim(country_code),''))
      SELECT code AS country_code,name AS country_name,clicks
      FROM c ORDER BY clicks DESC,code
    """),bind).mappings().all()
    return [{"country_code":r["country_code"],"country_name":r["country_name"] or r["country_code"],
             "clicks":r["clicks"],"conversions":0,"income":0.0} for r in rows]


def options(period: str=Query("all"), date_from: date|None=Query(None,alias="from"),
            date_to: date|None=Query(None,alias="to"), vertical: str|None=None,
            offer_id: str|None=None, network_id:int|None=None):
    if date_from and date_to and date_from>date_to: raise HTTPException(422,"Invalid date range")
    return arguments(period,date_from,date_to,vertical,offer_id,network_id)


@router.get("/statistics/{telegram_id}")
def existing_statistics(telegram_id:int,period:str="all",vertical:str|None=None,
                        offer_id:str|None=None,network_id:int|None=None,
                        date_from:date|None=Query(None,alias="from"),
                        date_to:date|None=Query(None,alias="to")):
    params=options(period,date_from,date_to,vertical,offer_id,network_id)
    with engine.connect() as conn:
        summary=summarize(conn,telegram_id,params)
        return {"success":True,"statistics":daily(conn,telegram_id,params),
                "summary":summary,"vertical":vertical or "all"}


@router.get("/statistics/{telegram_id}/countries")
def existing_countries(telegram_id:int,period:str="all",vertical:str|None=None,
                       offer_id:str|None=None,network_id:int|None=None,
                       date_from:date|None=Query(None,alias="from"),
                       date_to:date|None=Query(None,alias="to")):
    params=options(period,date_from,date_to,vertical,offer_id,network_id)
    with engine.connect() as conn:
        return {"success":True,"countries":countries(conn,telegram_id,params),
                "vertical":vertical or "all"}


@router.get("/statistics/{telegram_id}/breakdown")
def existing_breakdown(telegram_id:int,period:str="all",vertical:str|None=None,
                       offer_id:str|None=None,network_id:int|None=None,
                       date_from:date|None=Query(None,alias="from"),
                       date_to:date|None=Query(None,alias="to")):
    params=options(period,date_from,date_to,vertical,offer_id,network_id)
    with engine.connect() as conn:
        return {"success":True,"offers":grouped(conn,telegram_id,params,"offers"),
                "networks":grouped(conn,telegram_id,params,"networks")}


@router.get("/admin/analytics")
def admin_analytics(telegram_id:int|None=None,period:str="all",vertical:str|None=None,
                    offer_id:str|None=None,network_id:int|None=None,
                    date_from:date|None=Query(None,alias="from"),
                    date_to:date|None=Query(None,alias="to")):
    # /admin/ remains protected by access_guard with verified Telegram admin.
    params=options(period,date_from,date_to,vertical,offer_id,network_id)
    with engine.connect() as conn:
        return {"success":True,"summary":summarize(conn,telegram_id,params),
                "daily":daily(conn,telegram_id,params),
                "offers":grouped(conn,telegram_id,params,"offers"),
                "networks":grouped(conn,telegram_id,params,"networks"),
                "partners":grouped(conn,telegram_id,params,"partners")}
