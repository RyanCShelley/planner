"""Planner API: logic that doesn't belong in the browser (repeats, schedule rules,
Google Calendar, AI, push). Runs as a Vercel Python function; locally on :8000.

Database calls go through Supabase's REST API with the caller's own token, so
row-level security applies exactly as it does in the browser."""

import calendar
import os
from datetime import date, datetime, timedelta, timezone
from functools import lru_cache
from urllib.parse import quote, urlencode
from zoneinfo import ZoneInfo

import httpx
import jwt
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

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
    token = creds.credentials
    try:
        # New Supabase projects sign with asymmetric keys (JWKS); older and local ones use a shared secret.
        if jwt.get_unverified_header(token).get("alg") == "HS256":
            secret = os.environ.get("SUPABASE_JWT_SECRET")
            if not secret:
                raise jwt.InvalidTokenError("HS256 token but SUPABASE_JWT_SECRET is not set")
            jwt.decode(token, secret, algorithms=["HS256"], audience="authenticated")
        else:
            key = _jwks().get_signing_key_from_jwt(token)
            jwt.decode(token, key.key, algorithms=["ES256", "RS256"], audience="authenticated")
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


# --- Google Calendar OAuth2 & Sync -------------------------------------------

GOOGLE_SCOPES = (
    "https://www.googleapis.com/auth/calendar.readonly "
    "https://www.googleapis.com/auth/calendar.events"
)
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
GOOGLE_CALENDAR_BASE = "https://www.googleapis.com/calendar/v3"


def _google_client_id() -> str:
    val = os.environ.get("GOOGLE_CLIENT_ID")
    if not val:
        raise HTTPException(500, "GOOGLE_CLIENT_ID is not configured")
    return val


def _google_client_secret() -> str:
    val = os.environ.get("GOOGLE_CLIENT_SECRET")
    if not val:
        raise HTTPException(500, "GOOGLE_CLIENT_SECRET is not configured")
    return val


def _state_secret() -> str:
    return (
        os.environ.get("GOOGLE_CLIENT_SECRET")
        or os.environ.get("SUPABASE_JWT_SECRET")
        or "planner-oauth-state"
    )


def _google_redirect_uri(request: Request) -> str:
    if env_uri := os.environ.get("GOOGLE_REDIRECT_URI"):
        return env_uri
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
    return f"{proto}://{host}/api/auth/google/callback"


def _get_valid_google_token(token: str) -> tuple[str, dict]:
    """Fetch the user's Google connection, refreshing access_token if expired."""
    with rest(token) as c:
        r = c.get("/google_calendar_connections", params={"select": "*"})
        r.raise_for_status()
        rows = r.json()
    if not rows:
        raise HTTPException(400, "Google Calendar not connected")
    conn = rows[0]
    access_token = conn["access_token"]
    expires_at_raw = conn.get("expires_at")
    refresh_token = conn.get("refresh_token")

    needs_refresh = False
    if expires_at_raw:
        expires_at = datetime.fromisoformat(expires_at_raw.replace("Z", "+00:00"))
        if expires_at <= datetime.now(timezone.utc) + timedelta(seconds=60):
            needs_refresh = True

    if needs_refresh and refresh_token:
        with httpx.Client(timeout=10) as gc:
            tr = gc.post(
                GOOGLE_TOKEN_URL,
                data={
                    "client_id": _google_client_id(),
                    "client_secret": _google_client_secret(),
                    "refresh_token": refresh_token,
                    "grant_type": "refresh_token",
                },
            )
            if tr.status_code >= 400:
                raise HTTPException(401, "Failed to refresh Google token")
            tdata = tr.json()
        access_token = tdata["access_token"]
        expires_in = int(tdata.get("expires_in", 3600))
        new_expires_at = (datetime.now(timezone.utc) + timedelta(seconds=expires_in)).isoformat()
        with rest(token) as c:
            c.patch(
                "/google_calendar_connections",
                params={"user_id": f"eq.{conn['user_id']}"},
                json={"access_token": access_token, "expires_at": new_expires_at},
            ).raise_for_status()
        conn["access_token"] = access_token
        conn["expires_at"] = new_expires_at

    return access_token, conn


@app.get("/api/auth/google/url")
def google_auth_url(request: Request, token: str = Depends(current_token)) -> dict:
    state = jwt.encode(
        {"token": token, "exp": datetime.now(timezone.utc) + timedelta(minutes=15)},
        _state_secret(),
        algorithm="HS256",
    )
    params = {
        "client_id": _google_client_id(),
        "redirect_uri": _google_redirect_uri(request),
        "response_type": "code",
        "scope": GOOGLE_SCOPES,
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
        "state": state,
    }
    return {"url": f"{GOOGLE_AUTH_URL}?{urlencode(params)}"}


@app.get("/api/auth/google/callback")
def google_auth_callback(code: str, state: str, request: Request) -> RedirectResponse:
    try:
        payload = jwt.decode(state, _state_secret(), algorithms=["HS256"])
        user_token = payload["token"]
    except (jwt.PyJWTError, KeyError) as e:
        raise HTTPException(400, f"Invalid OAuth state: {e}") from e

    with httpx.Client(timeout=10) as gc:
        tr = gc.post(
            GOOGLE_TOKEN_URL,
            data={
                "client_id": _google_client_id(),
                "client_secret": _google_client_secret(),
                "code": code,
                "redirect_uri": _google_redirect_uri(request),
                "grant_type": "authorization_code",
            },
        )
        if tr.status_code >= 400:
            raise HTTPException(400, "Failed to exchange Google OAuth code")
        tdata = tr.json()

        access_token = tdata["access_token"]
        refresh_token = tdata.get("refresh_token")
        expires_in = int(tdata.get("expires_in", 3600))
        expires_at = (datetime.now(timezone.utc) + timedelta(seconds=expires_in)).isoformat()

        email = None
        ur = gc.get(GOOGLE_USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"})
        if ur.status_code == 200:
            email = ur.json().get("email")

    row: dict = {
        "access_token": access_token,
        "expires_at": expires_at,
        "email": email,
    }
    if refresh_token:
        row["refresh_token"] = refresh_token

    with rest(user_token) as c:
        c.post(
            "/google_calendar_connections",
            params={"on_conflict": "user_id"},
            headers={"Prefer": "resolution=merge-duplicates,return=representation"},
            json=row,
        ).raise_for_status()

    return RedirectResponse(url="/settings?connected=1", status_code=302)


@app.get("/api/auth/google/status")
def google_auth_status(token: str = Depends(current_token)) -> dict:
    with rest(token) as c:
        r = c.get("/google_calendar_connections", params={"select": "email,planner_calendar_id"})
        r.raise_for_status()
        rows = r.json()
    if not rows:
        return {"connected": False, "email": None, "planner_calendar_id": None}
    row = rows[0]
    return {
        "connected": True,
        "email": row.get("email"),
        "planner_calendar_id": row.get("planner_calendar_id"),
    }


@app.post("/api/auth/google/disconnect")
def google_auth_disconnect(token: str = Depends(current_token)) -> dict:
    with rest(token) as c:
        c.delete("/google_calendar_connections", params={"user_id": "not.is.null"}).raise_for_status()
    return {"ok": True}


@app.get("/api/calendar/events")
def list_calendar_events(start: str, end: str, token: str = Depends(current_token)) -> dict:
    access_token, _ = _get_valid_google_token(token)
    headers = {"Authorization": f"Bearer {access_token}"}
    time_min = f"{start}T00:00:00Z"
    time_max = f"{end}T23:59:59Z"

    events: list[dict] = []
    with httpx.Client(timeout=10) as gc:
        cr = gc.get(f"{GOOGLE_CALENDAR_BASE}/users/me/calendarList", headers=headers)
        cr.raise_for_status()
        calendars = cr.json().get("items", [])

        for cal in calendars:
            cal_id = cal["id"]
            cal_name = cal.get("summary")
            er = gc.get(
                f"{GOOGLE_CALENDAR_BASE}/calendars/{quote(cal_id, safe='')}/events",
                headers=headers,
                params={
                    "timeMin": time_min,
                    "timeMax": time_max,
                    "singleEvents": "true",
                    "orderBy": "startTime",
                },
            )
            if er.status_code >= 400:
                continue
            for ev in er.json().get("items", []):
                ev_start = ev.get("start", {})
                ev_end = ev.get("end", {})
                all_day = "date" in ev_start and "dateTime" not in ev_start
                events.append({
                    "id": ev["id"],
                    "title": ev.get("summary") or "(No title)",
                    "start": ev_start.get("dateTime") or ev_start.get("date"),
                    "end": ev_end.get("dateTime") or ev_end.get("date"),
                    "all_day": all_day,
                    "calendar_name": cal_name,
                })

    return {"events": events}


class SyncBlockBody(BaseModel):
    block_id: str


def _ensure_planner_calendar(token: str, access_token: str, conn: dict) -> str:
    if conn.get("planner_calendar_id"):
        return conn["planner_calendar_id"]

    headers = {"Authorization": f"Bearer {access_token}"}
    cal_id = None
    with httpx.Client(timeout=10) as gc:
        cr = gc.get(f"{GOOGLE_CALENDAR_BASE}/users/me/calendarList", headers=headers)
        cr.raise_for_status()
        for cal in cr.json().get("items", []):
            if cal.get("summary") == "Planner":
                cal_id = cal["id"]
                break
        if not cal_id:
            nr = gc.post(
                f"{GOOGLE_CALENDAR_BASE}/calendars",
                headers=headers,
                json={"summary": "Planner", "timeZone": "America/New_York"},
            )
            nr.raise_for_status()
            cal_id = nr.json()["id"]

    with rest(token) as c:
        c.patch(
            "/google_calendar_connections",
            params={"user_id": f"eq.{conn['user_id']}"},
            json={"planner_calendar_id": cal_id},
        ).raise_for_status()
    return cal_id


def _block_event_payload(block: dict) -> dict:
    title = block.get("title") or block.get("name") or "Planner Block"
    block_date = block.get("date") or datetime.now(TZ).date().isoformat()
    start_time = block["start_time"]
    if len(start_time) == 5:
        start_time = f"{start_time}:00"
    start_dt = datetime.fromisoformat(f"{block_date}T{start_time}").replace(tzinfo=TZ)

    end_time = block.get("end_time")
    if end_time:
        if len(end_time) == 5:
            end_time = f"{end_time}:00"
        end_dt = datetime.fromisoformat(f"{block_date}T{end_time}").replace(tzinfo=TZ)
    else:
        end_dt = start_dt + timedelta(hours=1)

    return {
        "summary": title,
        "start": {"dateTime": start_dt.isoformat()},
        "end": {"dateTime": end_dt.isoformat()},
    }


@app.post("/api/calendar/sync-block")
def sync_block_to_calendar(body: SyncBlockBody, token: str = Depends(current_token)) -> dict:
    with rest(token) as c:
        br = c.get("/blocks", params={"id": f"eq.{body.block_id}"})
        br.raise_for_status()
        blocks = br.json()
    if not blocks:
        raise HTTPException(404, "Block not found")
    block = blocks[0]

    access_token, conn = _get_valid_google_token(token)
    cal_id = _ensure_planner_calendar(token, access_token, conn)
    headers = {"Authorization": f"Bearer {access_token}"}
    cal_path = f"{GOOGLE_CALENDAR_BASE}/calendars/{quote(cal_id, safe='')}/events"
    existing_event_id = block.get("google_event_id")

    if block.get("start_time"):
        payload = _block_event_payload(block)
        with httpx.Client(timeout=10) as gc:
            if existing_event_id:
                er = gc.patch(f"{cal_path}/{quote(existing_event_id, safe='')}", headers=headers, json=payload)
                if er.status_code == 404:
                    er = gc.post(cal_path, headers=headers, json=payload)
            else:
                er = gc.post(cal_path, headers=headers, json=payload)
            er.raise_for_status()
            new_event_id = er.json()["id"]

        with rest(token) as c:
            c.patch(
                "/blocks",
                params={"id": f"eq.{body.block_id}"},
                json={"google_event_id": new_event_id},
            ).raise_for_status()
        return {"ok": True, "google_event_id": new_event_id}

    if existing_event_id:
        with httpx.Client(timeout=10) as gc:
            dr = gc.delete(f"{cal_path}/{quote(existing_event_id, safe='')}", headers=headers)
            if dr.status_code not in (200, 204, 404, 410):
                dr.raise_for_status()
        with rest(token) as c:
            c.patch(
                "/blocks",
                params={"id": f"eq.{body.block_id}"},
                json={"google_event_id": None},
            ).raise_for_status()

    return {"ok": True, "google_event_id": None}

