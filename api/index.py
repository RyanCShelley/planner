"""Planner API: logic that doesn't belong in the browser (repeats, schedule rules,
Google Calendar, AI, push). Runs as a Vercel Python function; locally on :8000."""

import os
from functools import lru_cache

import jwt
from fastapi import Depends, FastAPI, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

app = FastAPI(title="Planner API", docs_url="/api/docs", openapi_url="/api/openapi.json")
bearer = HTTPBearer(auto_error=False)


@lru_cache
def _jwks() -> jwt.PyJWKClient:
    url = os.environ.get("SUPABASE_URL") or os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    return jwt.PyJWKClient(f"{url}/auth/v1/.well-known/jwks.json")


def current_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer)) -> dict:
    """Verify the Supabase access token sent as `Authorization: Bearer <token>`."""
    if creds is None:
        raise HTTPException(401, "Not signed in")
    try:
        key = _jwks().get_signing_key_from_jwt(creds.credentials)
        return jwt.decode(creds.credentials, key.key, algorithms=["ES256", "RS256"], audience="authenticated")
    except jwt.PyJWTError as e:
        raise HTTPException(401, f"Invalid token: {e}") from e


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


@app.get("/api/me")
def me(user: dict = Depends(current_user)) -> dict:
    return {"id": user["sub"], "email": user.get("email")}
