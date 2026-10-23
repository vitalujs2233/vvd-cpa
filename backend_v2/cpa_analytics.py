"""Read-only Stage 6 analytics for the existing VVD CPA Analysis page.

Never creates ledger entries, modifies balances, or activates the finance epoch.
Legacy statistics and historical conversions are deliberately separate.
"""
from datetime import date, timedelta, datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from decimal import Decimal
from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import text
from database import engine

router = APIRouter(tags=["CPA Analytics"])
ZERO = Decimal("0.00")
FINAL = {"approved", "rejected"}


def bounds(period="all", date_from=None, date_to=None, tz="UTC"):
    try:
        zone = ZoneInfo(tz)
    except (ZoneInfoNotFoundError, ValueError):
        raise HTTPException(422, "Unknown timezone")
    if period not in ("today", "yesterday", "7days", "30days", "all"):
        raise HTTPException(422, "Unknown period")
    now = datetime.now(zone).date()
    start = {"today": now, "yesterday": now - timedelta(days=1),
             "7days": now - timedelta(days=6),
             "30days": now - timedelta(days=29), "all": None}[period]
    end = now - timedelta(days=1) if period == "yesterday" else now if period != "all" else None
    if date_from:
        start = max(start, date_from) if start else date_from
    if date_to:
        end = min(end, date_to) if end else date_to
    return start, end


def arguments(period, date_from, date_to, vertical, offer_id, network_id, tz="UTC"):
    start, end = bounds(period, date_from, date_to, tz)
    return {"start": start, "end": end, "vertical": vertical or None,
            "offer": offer_id or None, "network": network_id, "tz": tz}


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
 SELECT k.id,k.user_id,k.click_id,((k.created_at AT TIME ZONE 'UTC') AT TIME ZONE :tz)::date AS event_date,
        k.offer_id,k.network_id,k.vertical,k.country_code,k.country_name
 FROM public.clicks k
 WHERE (CAST(:uid AS BIGINT) IS NULL OR k.user_id=:uid)
 AND (CAST(:start AS DATE) IS NULL OR ((k.created_at AT TIME ZONE 'UTC') AT TIME ZONE :tz)::date>=:start)
 AND (CAST(:end AS DATE) IS NULL OR ((k.created_at AT TIME ZONE 'UTC') AT TIME ZONE :tz)::date<=:end)
 AND (CAST(:vertical AS TEXT) IS NULL OR k.vertical=:vertical)
 AND (CAST(:offer AS TEXT) IS NULL OR k.offer_id=:offer)
 AND (CAST(:network AS BIGINT) IS NULL OR k.network_id=:network)
"""
CONVERSION_ROWS = """
 SELECT v.id,v.user_id,v.click_id,(v.created_at AT TIME ZONE :tz)::date AS event_date,
        v.offer_id,v.network_id,v.vertical_slug,v.is_test,v.status,
        v.finance_eligible_at,v.finance_approved_at,v.currency,v.payout_gross,
        v.payout_net,
        """ + STATE + """ AS normalized_status,
        CASE WHEN """ + REAL + """ THEN TRUE ELSE FALSE END AS is_real
 FROM public.conversions v CROSS JOIN public.cpa_finance_epoch e
 WHERE e.id=1 AND (CAST(:uid AS BIGINT) IS NULL OR v.user_id=:uid)
 AND (CAST(:start AS DATE) IS NULL OR (v.created_at AT TIME ZONE :tz)::date>=:start)
 AND (CAST(:end AS DATE) IS NULL OR (v.created_at AT TIME ZONE :tz)::date<=:end)
 AND (CAST(:vertical AS TEXT) IS NULL OR v.vertical_slug=:vertical)
 AND (CAST(:offer AS TEXT) IS NULL OR v.offer_id=:offer)
 AND (CAST(:network AS BIGINT) IS NULL OR v.network_id=:network)
"""


def scalar(value):
    return float(value or ZERO)


def summarize(conn, uid, params, *, admin=False):
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
        # Finance earnings only from actual ledger events, never assumed based on approvals.
        finance["partner"] = sum((row["hold_delta"] for row in ledger if row["operation_type"] in ("hold_credit","hold_reversal")), ZERO) + sum((row["balance_delta"] for row in ledger if row["operation_type"]=="balance_reversal"), ZERO)
        finance["fee"] = sum((row["platform_fee_delta"] for row in ledger if row["operation_type"] in ("platform_fee_accrual","platform_fee_reversal")), ZERO)
        finance["gross"] = finance["partner"] + finance["fee"]
        finance["hold"] = sum((row["hold_delta"] for row in ledger if row["operation_type"] in ("hold_credit","hold_release","manual_hold_release","hold_reversal")), ZERO)
        finance["released"] = sum((row["balance_delta"] for row in ledger if row["operation_type"] in ("hold_release","manual_hold_release","balance_reversal")), ZERO)
    if uid is not None:
        # Respect the stage 5 real finance entitlement, including reservations and
        # withdrawal reservations. Never count demo balance as earnings.
        from cpa_real_withdrawals import finance_balance_projection
        old = conn.execute(text("SELECT balance FROM public.users WHERE telegram_id=:uid"),
                           {"uid":uid}).scalar()
        if old is not None and conn.execute(text("SELECT activated_at IS NOT NULL FROM public.cpa_finance_epoch WHERE id=1")).scalar():
            finance["real_withdrawable"] = Decimal(str(finance_balance_projection(conn,uid,old)["real_withdrawable"]))
    statuses = {s:sum(1 for row in conv if row["normalized_status"]==s and not row["is_test"])
                for s in ("pending","approved","rejected","legacy","unknown")}
    count = sum(statuses[x] for x in ("pending","approved","rejected"))
    # Real EPC never uses the historic/demo earnings.
    result={"clicks":int(clicks),"conversions":count,"approved_conversions":statuses["approved"],"statuses":statuses,
            "cr":round(100*count/clicks,2) if clicks else 0.0,
            "approved_cr":round(100*statuses["approved"]/clicks,2) if clicks else 0.0,
            "epc":scalar(finance["partner"] / clicks) if clicks else 0.0,
            "earned":scalar(finance["partner"]), "on_hold":scalar(finance["hold"]),
            "real_withdrawable":scalar(finance["real_withdrawable"]),
            "legacy_conversions":statuses["legacy"],"test_conversions":sum(bool(row["is_test"]) for row in conv),
            "historical_income_included":False}
    if admin:
        result["finance"]={key:scalar(value) for key,value in finance.items()}
    return result


def daily(conn, uid, params):
    bind={**params,"uid":uid}
    rows=conn.execute(text("""
      WITH c AS (SELECT event_date,count(*) clicks FROM ("""+CLICK_ROWS+""") x GROUP BY event_date),
           v AS (SELECT event_date,
                     count(*) FILTER(WHERE NOT is_test AND normalized_status IN ('pending','approved','rejected')) conversions,
                     count(*) FILTER(WHERE NOT is_test AND normalized_status='pending') pending,
                     count(*) FILTER(WHERE NOT is_test AND normalized_status='approved') approved,
                     count(*) FILTER(WHERE NOT is_test AND normalized_status='rejected') rejected
                 FROM ("""+CONVERSION_ROWS+""") x GROUP BY event_date)
      SELECT COALESCE(c.event_date,v.event_date) AS event_day,COALESCE(c.clicks,0) clicks,
             COALESCE(v.conversions,0) conversions,COALESCE(v.pending,0) pending,
             COALESCE(v.approved,0) approved,COALESCE(v.rejected,0) rejected
      FROM c FULL JOIN v ON c.event_date=v.event_date ORDER BY event_day
    """),bind).mappings().all()
    income = {}
    finance_rows = conn.execute(text("""
      SELECT v.event_date, COALESCE(SUM(CASE
        WHEN l.operation_type IN ('hold_credit','hold_reversal') THEN l.hold_delta
        WHEN l.operation_type='balance_reversal' THEN l.balance_delta ELSE 0 END),0) AS earned
      FROM ("""+CONVERSION_ROWS+""") v JOIN public.cpa_ledger l ON l.conversion_id=v.id
      WHERE v.is_real GROUP BY v.event_date
    """), bind).mappings().all()
    income = {r["event_date"]:scalar(r["earned"]) for r in finance_rows}
    return [{"date":str(r["event_day"]),"clicks":r["clicks"],
             "conversions":r["conversions"],"pending":r["pending"],
             "approved":r["approved"],"rejected":r["rejected"],"income":income.get(r["event_day"],0.0)}
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
              count(*) FILTER(WHERE NOT is_test AND normalized_status IN ('pending','approved','rejected')) conversions,
              count(*) FILTER(WHERE NOT is_test AND normalized_status='approved') approved,
              count(*) FILTER(WHERE NOT is_test AND normalized_status='pending') pending,
              count(*) FILTER(WHERE NOT is_test AND normalized_status='rejected') rejected
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
    """Independent click/conversion dates; attribute conversions to the original click country."""
    bind={**params,"uid":uid}
    rows=conn.execute(text("""
      WITH clicks AS ("""+CLICK_ROWS+"""), conversions AS ("""+CONVERSION_ROWS+"""),
      amounts AS (
        SELECT l.conversion_id,
          sum(CASE WHEN l.operation_type IN ('hold_credit','hold_reversal') THEN l.hold_delta
                   WHEN l.operation_type='balance_reversal' THEN l.balance_delta ELSE 0 END) AS income,
          sum(CASE WHEN l.operation_type IN ('hold_credit','hold_release','manual_hold_release','hold_reversal')
                   THEN l.hold_delta ELSE 0 END) AS hold
        FROM public.cpa_ledger l JOIN conversions v ON v.id=l.conversion_id
        WHERE v.is_real GROUP BY l.conversion_id
      ), events AS (
        SELECT country_code,country_name,1 AS clicks,0 AS conversions,
               0 AS pending,0 AS approved,0 AS rejected,0::numeric AS income,0::numeric AS hold FROM clicks
        UNION ALL
        SELECT k.country_code,k.country_name,0,1,
               CASE WHEN v.normalized_status='pending' THEN 1 ELSE 0 END,
               CASE WHEN v.normalized_status='approved' THEN 1 ELSE 0 END,
               CASE WHEN v.normalized_status='rejected' THEN 1 ELSE 0 END,
               coalesce(a.income,0),coalesce(a.hold,0)
        FROM conversions v
        LEFT JOIN public.clicks k ON k.click_id=v.click_id AND k.user_id=v.user_id
        LEFT JOIN amounts a ON a.conversion_id=v.id
        WHERE NOT v.is_test AND v.normalized_status IN ('pending','approved','rejected')
      ), normalized AS (
        SELECT CASE WHEN upper(trim(country_code)) ~ '^[A-Z]{2}$'
                     AND upper(trim(country_code)) NOT IN ('XX','ZZ')
                    THEN upper(trim(country_code)) END AS code, * FROM events
      )
      SELECT code AS country_code,max(CASE WHEN code IS NOT NULL THEN nullif(trim(country_name),'') END) AS country_name,
             sum(clicks) AS clicks,sum(conversions) AS conversions,sum(pending) AS pending,
             sum(approved) AS approved,sum(rejected) AS rejected,sum(income) AS income,sum(hold) AS hold
      FROM normalized GROUP BY code ORDER BY clicks DESC,code NULLS LAST
    """),bind).mappings().all()
    return [{"country_code":r["country_code"],
             "country_name":r["country_name"] or r["country_code"] or "Не определена",
             "clicks":int(r["clicks"]),"conversions":int(r["conversions"]),
             "pending":int(r["pending"]),"approved":int(r["approved"]),"rejected":int(r["rejected"]),
             "income":scalar(r["income"]),"hold":scalar(r["hold"]),
             "cr":round(100*r["conversions"]/r["clicks"],2) if r["clicks"] else None,
             "epc":scalar(r["income"]/r["clicks"]) if r["clicks"] else None} for r in rows]


def recent_clicks(conn, uid, params, limit=10, offset=0):
    """Only owned click facts; never expose visitor IP, click ID or network tokens."""
    rows=conn.execute(text("""
        SELECT k.created_at AT TIME ZONE 'UTC' AS clicked_at,
               CASE WHEN upper(trim(k.country_code)) ~ '^[A-Z]{2}$'
                         AND upper(trim(k.country_code)) NOT IN ('XX','ZZ')
                    THEN upper(trim(k.country_code)) ELSE NULL END AS country_code,
               CASE WHEN upper(trim(k.country_code)) ~ '^[A-Z]{2}$'
                         AND upper(trim(k.country_code)) NOT IN ('XX','ZZ')
                    THEN NULLIF(trim(k.country_name),'') ELSE NULL END AS country_name,
               o.title AS offer_name
        FROM public.clicks k
        LEFT JOIN public.offers o ON o.id=k.offer_id
        WHERE k.user_id=:uid
          AND (CAST(:start AS DATE) IS NULL OR ((k.created_at AT TIME ZONE 'UTC') AT TIME ZONE :tz)::date >= :start)
          AND (CAST(:end AS DATE) IS NULL OR ((k.created_at AT TIME ZONE 'UTC') AT TIME ZONE :tz)::date <= :end)
          AND (CAST(:vertical AS TEXT) IS NULL OR k.vertical=:vertical)
          AND (CAST(:offer AS TEXT) IS NULL OR k.offer_id=:offer)
          AND (CAST(:network AS BIGINT) IS NULL OR k.network_id=:network)
        ORDER BY k.created_at DESC,k.id DESC
        LIMIT :limit OFFSET :offset
    """),{**params,"uid":uid,"limit":limit,"offset":offset}).mappings().all()
    return [{"created_at":r["clicked_at"].isoformat(),
             "country_code":r["country_code"],
             "country_name":r["country_name"] or r["country_code"] or "Не определена",
             "offer_name":r["offer_name"]} for r in rows]



def options(period: str=Query("all"), date_from: date|None=Query(None,alias="from"),
            date_to: date|None=Query(None,alias="to"), vertical: str|None=None,
            offer_id: str|None=None, network_id:int|None=None):
    if date_from and date_to and date_from>date_to: raise HTTPException(422,"Invalid date range")
    return arguments(period,date_from,date_to,vertical,offer_id,network_id)


@router.get("/statistics/{telegram_id}")
def existing_statistics(telegram_id:int,period:str="all",vertical:str|None=None,
                        offer_id:str|None=None,network_id:int|None=None,
                        date_from:date|None=Query(None,alias="from"),
                        date_to:date|None=Query(None,alias="to"),tz:str="UTC"):
    if date_from and date_to and date_from>date_to: raise HTTPException(422,'Invalid date range')
    params=arguments(period,date_from,date_to,vertical,offer_id,network_id,tz)
    with engine.connect() as conn:
        summary=summarize(conn,telegram_id,params)
        return {"success":True,"statistics":daily(conn,telegram_id,params),
                "summary":summary,"vertical":vertical or "all"}


@router.get("/statistics/{telegram_id}/countries")
def existing_countries(telegram_id:int,period:str="all",vertical:str|None=None,
                       offer_id:str|None=None,network_id:int|None=None,
                       date_from:date|None=Query(None,alias="from"),
                       date_to:date|None=Query(None,alias="to"),tz:str="UTC"):
    if date_from and date_to and date_from>date_to: raise HTTPException(422,'Invalid date range')
    params=arguments(period,date_from,date_to,vertical,offer_id,network_id,tz)
    with engine.connect() as conn:
        return {"success":True,"countries":countries(conn,telegram_id,params),
                "vertical":vertical or "all"}


@router.get("/statistics/{telegram_id}/clicks")
def partner_recent_clicks(telegram_id:int,period:str="all",vertical:str|None=None,
                          offer_id:str|None=None,network_id:int|None=None,
                          date_from:date|None=Query(None,alias="from"),
                          date_to:date|None=Query(None,alias="to"),
                          limit:int=Query(10,ge=1,le=20),
                          offset:int=Query(0,ge=0),tz:str="UTC"):
    if date_from and date_to and date_from>date_to: raise HTTPException(422,"Invalid date range")
    params=arguments(period,date_from,date_to,vertical,offer_id,network_id,tz)
    with engine.connect() as conn:
        return {"success":True,"clicks":recent_clicks(conn,telegram_id,params,limit,offset),
                "limit":limit,"offset":offset}


@router.get("/statistics/{telegram_id}/breakdown")
def existing_breakdown(telegram_id:int,period:str="all",vertical:str|None=None,
                       offer_id:str|None=None,network_id:int|None=None,
                       date_from:date|None=Query(None,alias="from"),
                       date_to:date|None=Query(None,alias="to"),tz:str="UTC"):
    if date_from and date_to and date_from>date_to: raise HTTPException(422,'Invalid date range')
    params=arguments(period,date_from,date_to,vertical,offer_id,network_id,tz)
    with engine.connect() as conn:
        return {"success":True,"offers":grouped(conn,telegram_id,params,"offers"),
                "networks":grouped(conn,telegram_id,params,"networks")}


@router.get("/admin/analytics")
def admin_analytics(telegram_id:int|None=None,period:str="all",vertical:str|None=None,
                    offer_id:str|None=None,network_id:int|None=None,
                    date_from:date|None=Query(None,alias="from"),
                    date_to:date|None=Query(None,alias="to"),tz:str="UTC"):
    # /admin/ remains protected by access_guard with verified Telegram admin.
    if date_from and date_to and date_from>date_to: raise HTTPException(422,'Invalid date range')
    params=arguments(period,date_from,date_to,vertical,offer_id,network_id,tz)
    with engine.connect() as conn:
        return {"success":True,"summary":summarize(conn,telegram_id,params,admin=True),
                "daily":daily(conn,telegram_id,params),
                "offers":grouped(conn,telegram_id,params,"offers"),
                "networks":grouped(conn,telegram_id,params,"networks"),
                "partners":grouped(conn,telegram_id,params,"partners")}


def traffic_subs(conn, uid, params, field="sub1", search="", limit=50, offset=0):
    # Only allow known column names; all values remain bound parameters.
    if field not in ("sub1", "sub2", "sub3", "sub4", "sub5"):
        raise HTTPException(422, "Unknown sub field")
    rows = conn.execute(text("""
      WITH clicks AS ("""+CLICK_ROWS+"""), conversions AS ("""+CONVERSION_ROWS+"""),
      amounts AS (
        SELECT l.conversion_id,
          sum(CASE WHEN l.operation_type IN ('hold_credit','hold_reversal') THEN l.hold_delta
                   WHEN l.operation_type='balance_reversal' THEN l.balance_delta ELSE 0 END) income,
          sum(CASE WHEN l.operation_type IN ('hold_credit','hold_release','manual_hold_release','hold_reversal')
                   THEN l.hold_delta ELSE 0 END) hold
        FROM public.cpa_ledger l JOIN conversions v ON v.id=l.conversion_id
        WHERE v.is_real GROUP BY l.conversion_id
      ), events AS (
        SELECT k."""+field+""" AS value,1 AS clicks,0 AS conversions,
               0 AS pending,0 AS approved,0 AS rejected,0::numeric AS income,0::numeric AS hold
        FROM clicks c JOIN public.clicks k ON k.id=c.id
        UNION ALL
        SELECT k."""+field+""",0,1,
               CASE WHEN v.normalized_status='pending' THEN 1 ELSE 0 END,
               CASE WHEN v.normalized_status='approved' THEN 1 ELSE 0 END,
               CASE WHEN v.normalized_status='rejected' THEN 1 ELSE 0 END,
               coalesce(a.income,0),coalesce(a.hold,0)
        FROM conversions v
        LEFT JOIN public.clicks k ON k.click_id=v.click_id AND k.user_id=v.user_id
        LEFT JOIN amounts a ON a.conversion_id=v.id
        WHERE NOT v.is_test AND v.normalized_status IN ('pending','approved','rejected')
      )
      SELECT value,sum(clicks) clicks,sum(conversions) conversions,
             sum(pending) pending,sum(approved) approved,sum(rejected) rejected,
             sum(income) income,sum(hold) hold
      FROM events
      WHERE :search='' OR strpos(lower(coalesce(value,'')),lower(:search))>0
      GROUP BY value ORDER BY clicks DESC,value NULLS LAST LIMIT :limit OFFSET :offset
    """),{**params,"uid":uid,"search":search.strip(),"limit":limit+1,"offset":offset}).mappings().all()
    return {"rows":[{"value":r["value"],
             **{k:int(r[k]) for k in ("clicks","conversions","pending","approved","rejected")},
             "income":scalar(r["income"]),"hold":scalar(r["hold"]),
             "cr":round(100*r["conversions"]/r["clicks"],2) if r["clicks"] else None,
             "epc":scalar(r["income"]/r["clicks"]) if r["clicks"] else None} for r in rows[:limit]],
             "has_more":len(rows)>limit}


@router.get("/statistics/{telegram_id}/subs")
def partner_subs(telegram_id:int,period:str="all",vertical:str|None=None,
                 offer_id:str|None=None,network_id:int|None=None,
                 date_from:date|None=Query(None,alias="from"),
                 date_to:date|None=Query(None,alias="to"),tz:str="UTC",
                 field:str=Query("sub1",pattern="^sub[1-5]$"),
                 search:str=Query("",max_length=128),limit:int=Query(50,ge=1,le=100),
                 offset:int=Query(0,ge=0)):
    # access_guard enforces signed Telegram owner/admin on /statistics/{id}/*.
    if date_from and date_to and date_from>date_to: raise HTTPException(422,"Invalid date range")
    params=arguments(period,date_from,date_to,vertical,offer_id,network_id,tz)
    with engine.connect() as conn:
        return {"success":True,"field":field,**traffic_subs(conn,telegram_id,params,field,search,limit,offset)}
