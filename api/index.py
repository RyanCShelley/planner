"""Planner API: logic that doesn't belong in the browser (repeats, schedule rules,
Google Calendar, AI, push). Runs as a Vercel Python function; locally on :8000.

Database calls go through Supabase's REST API with the caller's own token, so
row-level security applies exactly as it does in the browser."""

import calendar
import os
from datetime import date, datetime, timedelta, timezone
from functools import lru_cache
from zoneinfo import ZoneInfo

import httpx
import jwt
from fastapi import Depends, FastAPI, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

TZ = ZoneInfo("America/New_York")

app = FastAPI(title="Planner API", docs_url="/api/docs", openapi_url="/api/openapi.json")
bearer = HTTPBearer(auto_error=False)


def _supabase_url() -> str:
    return os.environ.get("SUPABASE_URL") or os.environ["NEXT_PUBLIC_SUPABASE_URL"]


@lru_cache
def _jwks() -> jwt.PyJWKClient:
    return jwt.PyJWKClient(f"{_supabase_url()}/auth/v1/.well-known/jwks.json")


def current_token(creds: HTTPAuthorizationCredentials | None = Depends(bearer)) -> str:
    """Verify the Supabase access token sent as `Authorization: Bearer <token>`."""
    if creds is None:
        raise HTTPException(401, "Not signed in")
    try:
        key = _jwks().get_signing_key_from_jwt(creds.credentials)
        jwt.decode(creds.credentials, key.key, algorithms=["ES256", "RS256"], audience="authenticated")
    except jwt.PyJWTError as e:
        raise HTTPException(401, f"Invalid token: {e}") from e
    return creds.credentials


def rest(token: str) -> httpx.Client:
    """PostgREST client acting as the signed-in user."""
    return httpx.Client(
        base_url=f"{_supabase_url()}/rest/v1",
        headers={
            "apikey": os.environ["NEXT_PUBLIC_SUPABASE_ANON_KEY"],
            "Authorization": f"Bearer {token}",
            "Prefer": "return=representation",
        },
        timeout=10,
    )


# --- Repeats -----------------------------------------------------------------

def _sun0(d: date) -> int:
    """Weekday with Sunday = 0, matching the database."""
    return (d.weekday() + 1) % 7


def next_due(repeat: str, repeat_days: list[int] | None, base: date) -> date | None:
    """The next date a repeating item comes up after `base`."""
    match repeat:
        case "daily":
            return base + timedelta(days=1)
        case "weekly":
            return base + timedelta(weeks=1)
        case "biweekly":
            return base + timedelta(weeks=2)
        case "weekdays":
            d = base + timedelta(days=1)
            while _sun0(d) in (0, 6):
                d += timedelta(days=1)
            return d
        case "monthly":
            y, m = (base.year + 1, 1) if base.month == 12 else (base.year, base.month + 1)
            return date(y, m, min(base.day, calendar.monthrange(y, m)[1]))
        case "days" if repeat_days:
            for i in range(1, 8):
                d = base + timedelta(days=i)
                if _sun0(d) in repeat_days:
                    return d
    return None


# --- Routes ------------------------------------------------------------------

@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


@app.post("/api/items/{item_id}/complete")
def complete_item(item_id: str, token: str = Depends(current_token)) -> dict:
    """Mark an item done. A repeating item gets its next instance, so no series is pre-filled."""
    with rest(token) as c:
        r = c.patch("/items", params={"id": f"eq.{item_id}", "done_at": "is.null"},
                    json={"done_at": datetime.now(timezone.utc).isoformat()})
        r.raise_for_status()
        if not r.json():
            raise HTTPException(404, "Item not found or already done")
        item = r.json()[0]

        today = datetime.now(TZ).date()
        base = max(date.fromisoformat(item["due_date"]), today) if item["due_date"] else today
        nxt = next_due(item["repeat"], item["repeat_days"], base)
        if nxt:
            keep = ("title", "notes", "area_id", "project_id", "goal_id", "repeat",
                    "repeat_days", "leverage", "priority", "must")
            c.post("/items", json={**{k: item[k] for k in keep}, "due_date": nxt.isoformat()}).raise_for_status()

    return {"next_due": nxt.isoformat() if nxt else None}
