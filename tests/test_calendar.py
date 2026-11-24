from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient

from api import index


class FakeResponse:
    def __init__(self, status_code: int = 200, json_data=None):
        self.status_code = status_code
        self._json_data = json_data

    def json(self):
        return self._json_data

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


class FakeClient:
    def __init__(self, handler):
        self._handler = handler

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def get(self, url, **kwargs):
        return self._handler("GET", url, **kwargs)

    def post(self, url, **kwargs):
        return self._handler("POST", url, **kwargs)

    def patch(self, url, **kwargs):
        return self._handler("PATCH", url, **kwargs)

    def delete(self, url, **kwargs):
        return self._handler("DELETE", url, **kwargs)


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test-client-id")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "test-client-secret")
    monkeypatch.setenv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key")
    index.app.dependency_overrides[index.current_token] = lambda: "user-jwt-token"
    yield TestClient(index.app)
    index.app.dependency_overrides.clear()


def test_google_auth_url(client):
    res = client.get("/api/auth/google/url")
    assert res.status_code == 200
    url = res.json()["url"]
    parsed = urlparse(url)
    assert parsed.netloc == "accounts.google.com"
    qs = parse_qs(parsed.query)
    assert qs["client_id"] == ["test-client-id"]
    assert "https://www.googleapis.com/auth/calendar.readonly" in qs["scope"][0]
    assert "https://www.googleapis.com/auth/calendar.events" in qs["scope"][0]
    assert qs["access_type"] == ["offline"]
    assert "state" in qs


def test_google_auth_callback(client, monkeypatch):
    url_res = client.get("/api/auth/google/url")
    state = parse_qs(urlparse(url_res.json()["url"]).query)["state"][0]

    saved = {}

    def fake_google(method, url, **kwargs):
        if url == index.GOOGLE_TOKEN_URL:
            return FakeResponse(200, {
                "access_token": "g-access",
                "refresh_token": "g-refresh",
                "expires_in": 3600,
            })
        if url == index.GOOGLE_USERINFO_URL:
            return FakeResponse(200, {"email": "ryan@example.com"})
        raise AssertionError(f"Unexpected Google call: {method} {url}")

    def fake_rest(method, url, **kwargs):
        if method == "POST" and url == "/google_calendar_connections":
            saved["row"] = kwargs["json"]
            return FakeResponse(201, [kwargs["json"]])
        raise AssertionError(f"Unexpected REST call: {method} {url}")

    monkeypatch.setattr(index.httpx, "Client", lambda **kw: FakeClient(fake_google))
    monkeypatch.setattr(index, "rest", lambda token: FakeClient(fake_rest))

    res = client.get(f"/api/auth/google/callback?code=auth-code&state={state}", follow_redirects=False)
    assert res.status_code == 302
    assert res.headers["location"] == "/settings?connected=1"
    assert saved["row"]["access_token"] == "g-access"
    assert saved["row"]["refresh_token"] == "g-refresh"
    assert saved["row"]["email"] == "ryan@example.com"


def test_google_auth_status_and_disconnect(client, monkeypatch):
    state = {"connected": True}

    def fake_rest(method, url, **kwargs):
        if method == "GET" and url == "/google_calendar_connections":
            if state["connected"]:
                return FakeResponse(200, [{"email": "ryan@example.com", "planner_calendar_id": "cal-planner"}])
            return FakeResponse(200, [])
        if method == "DELETE" and url == "/google_calendar_connections":
            state["connected"] = False
            return FakeResponse(200, [])
        raise AssertionError(f"Unexpected REST call: {method} {url}")

    monkeypatch.setattr(index, "rest", lambda token: FakeClient(fake_rest))

    res = client.get("/api/auth/google/status")
    assert res.status_code == 200
    assert res.json() == {
        "connected": True,
        "email": "ryan@example.com",
        "planner_calendar_id": "cal-planner",
    }

    disc = client.post("/api/auth/google/disconnect")
    assert disc.status_code == 200
    assert disc.json() == {"ok": True}

    res2 = client.get("/api/auth/google/status")
    assert res2.status_code == 200
    assert res2.json() == {
        "connected": False,
        "email": None,
        "planner_calendar_id": None,
    }


def test_token_refresh_and_list_events(client, monkeypatch):
    expired_at = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    patched = {}

    def fake_rest(method, url, **kwargs):
        if method == "GET" and url == "/google_calendar_connections":
            return FakeResponse(200, [{
                "user_id": "user-1",
                "access_token": "old-access",
                "refresh_token": "g-refresh",
                "expires_at": expired_at,
                "planner_calendar_id": None,
            }])
        if method == "PATCH" and url == "/google_calendar_connections":
            patched["json"] = kwargs["json"]
            return FakeResponse(200, [kwargs["json"]])
        raise AssertionError(f"Unexpected REST call: {method} {url}")

    def fake_google(method, url, **kwargs):
        if method == "POST" and url == index.GOOGLE_TOKEN_URL:
            return FakeResponse(200, {"access_token": "new-access", "expires_in": 3600})
        if method == "GET" and url.endswith("/users/me/calendarList"):
            assert kwargs["headers"]["Authorization"] == "Bearer new-access"
            return FakeResponse(200, {"items": [{"id": "primary", "summary": "Personal"}]})
        if method == "GET" and "/calendars/primary/events" in url:
            return FakeResponse(200, {
                "items": [
                    {
                        "id": "ev-1",
                        "summary": "Standup",
                        "start": {"dateTime": "2026-11-24T09:00:00-05:00"},
                        "end": {"dateTime": "2026-11-24T09:30:00-05:00"},
                    },
                    {
                        "id": "ev-2",
                        "summary": "Holiday",
                        "start": {"date": "2026-11-26"},
                        "end": {"date": "2026-11-27"},
                    },
                ]
            })
        raise AssertionError(f"Unexpected Google call: {method} {url}")

    monkeypatch.setattr(index, "rest", lambda token: FakeClient(fake_rest))
    monkeypatch.setattr(index.httpx, "Client", lambda **kw: FakeClient(fake_google))

    res = client.get("/api/calendar/events?start=2026-11-24&end=2026-11-30")
    assert res.status_code == 200
    assert patched["json"]["access_token"] == "new-access"
    events = res.json()["events"]
    assert len(events) == 2
    assert events[0] == {
        "id": "ev-1",
        "title": "Standup",
        "start": "2026-11-24T09:00:00-05:00",
        "end": "2026-11-24T09:30:00-05:00",
        "all_day": False,
        "calendar_name": "Personal",
    }
    assert events[1]["all_day"] is True


def test_sync_block_create_and_delete(client, monkeypatch):
    future_at = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    block_state = {
        "id": "blk-1",
        "title": "Deep Work",
        "date": "2026-11-24",
        "start_time": "10:00",
        "end_time": "11:30",
        "google_event_id": None,
    }
    conn_state = {
        "user_id": "user-1",
        "access_token": "valid-access",
        "refresh_token": "g-refresh",
        "expires_at": future_at,
        "planner_calendar_id": None,
    }

    def fake_rest(method, url, **kwargs):
        if method == "GET" and url == "/blocks":
            return FakeResponse(200, [dict(block_state)])
        if method == "GET" and url == "/google_calendar_connections":
            return FakeResponse(200, [dict(conn_state)])
        if method == "PATCH" and url == "/google_calendar_connections":
            conn_state.update(kwargs["json"])
            return FakeResponse(200, [dict(conn_state)])
        if method == "PATCH" and url == "/blocks":
            block_state.update(kwargs["json"])
            return FakeResponse(200, [dict(block_state)])
        raise AssertionError(f"Unexpected REST call: {method} {url}")

    def fake_google(method, url, **kwargs):
        if method == "GET" and url.endswith("/users/me/calendarList"):
            return FakeResponse(200, {"items": [{"id": "primary", "summary": "Personal"}]})
        if method == "POST" and url.endswith("/calendars"):
            assert kwargs["json"]["summary"] == "Planner"
            return FakeResponse(200, {"id": "cal-planner-1"})
        if method == "POST" and "/calendars/cal-planner-1/events" in url:
            assert kwargs["json"]["summary"] == "Deep Work"
            return FakeResponse(200, {"id": "g-ev-1"})
        if method == "DELETE" and "/calendars/cal-planner-1/events/g-ev-1" in url:
            return FakeResponse(204, None)
        raise AssertionError(f"Unexpected Google call: {method} {url}")

    monkeypatch.setattr(index, "rest", lambda token: FakeClient(fake_rest))
    monkeypatch.setattr(index.httpx, "Client", lambda **kw: FakeClient(fake_google))

    res = client.post("/api/calendar/sync-block", json={"block_id": "blk-1"})
    assert res.status_code == 200
    assert res.json() == {"ok": True, "google_event_id": "g-ev-1"}
    assert conn_state["planner_calendar_id"] == "cal-planner-1"
    assert block_state["google_event_id"] == "g-ev-1"

    # Unpin block (start_time -> None) and sync again to delete event
    block_state["start_time"] = None
    res2 = client.post("/api/calendar/sync-block", json={"block_id": "blk-1"})
    assert res2.status_code == 200
    assert res2.json() == {"ok": True, "google_event_id": None}
    assert block_state["google_event_id"] is None
