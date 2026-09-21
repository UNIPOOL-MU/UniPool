"""
Authentication service.
Contains business logic for user authentication, registration, and session management.
"""

import asyncio
import hashlib
import os
import sys
from pathlib import Path

backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from typing import Optional, Dict, Any
from config.database import db
from helpers.auth_helper import (
    _hash_password, _verify_password, _create_session_token,
    _create_session_for_user, _with_admin_flag
)
from helpers.roll_number_decoder import decode_roll_number
from models.user import UserOut, SignupRequest, LoginRequest
from models.auth import GoogleSignIn, MicrosoftSignIn
from config.settings import GOOGLE_CLIENT_ID
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests
from cachecontrol import CacheControl
import requests as requests_lib
import logging
import httpx
import jwt
from jwt import PyJWKClient
from datetime import datetime, timezone, timedelta
from config.settings import TURNSTILE_SECRET_KEY

logger = logging.getLogger("unipool.auth")

IST = timezone(timedelta(hours=5, minutes=30))
_GOOGLE_REQUEST = google_requests.Request(session=CacheControl(requests_lib.Session()))
MU_EMAIL_DOMAIN = "mahindrauniversity.edu.in"
MICROSOFT_CLIENT_ID = os.environ.get("MICROSOFT_CLIENT_ID", "").strip()
MICROSOFT_TENANT_ID = os.environ.get("MICROSOFT_TENANT_ID", "organizations").strip() or "organizations"
_MICROSOFT_CONSUMER_TENANT = "9188040d-6c67-4c5b-b112-36a304b66dad"
_MICROSOFT_JWKS = PyJWKClient("https://login.microsoftonline.com/common/discovery/v2.0/keys")
_LOGIN_FAILURE_LIMIT = 8
_LOGIN_FAILURE_WINDOW = timedelta(minutes=10)


def _fmt_ist(dt: datetime) -> str:
    """Format stored datetimes as India Standard Time for notifications."""
    if dt.tzinfo is None or dt.tzinfo.utcoffset(dt) is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(IST).strftime("%d %b %Y, %I:%M %p IST")


def _is_mu_email(email: str) -> bool:
    normalized = (email or "").strip().lower()
    return normalized.endswith(f"@{MU_EMAIL_DOMAIN}") and normalized.count("@") == 1


def _login_attempt_key(identifier: str) -> str:
    """Hash login identifiers so throttle records do not duplicate raw emails/usernames."""
    return hashlib.sha256(identifier.strip().casefold().encode("utf-8")).hexdigest()


async def _check_login_throttle(identifier: str) -> str:
    key = _login_attempt_key(identifier)
    now = datetime.now(timezone.utc)
    await db.auth_login_attempts.delete_many({"expires_at": {"$lte": now}})
    attempt = await db.auth_login_attempts.find_one({"key": key}, {"_id": 0, "count": 1, "expires_at": 1})
    if attempt and int(attempt.get("count") or 0) >= _LOGIN_FAILURE_LIMIT:
        expires = attempt.get("expires_at")
        if expires and _ensure_aware(expires) > now:
            raise Exception("Too many login attempts. Try again in a few minutes.")
    return key


async def _record_login_failure(key: str) -> None:
    now = datetime.now(timezone.utc)
    await db.auth_login_attempts.update_one(
        {"key": key},
        {
            "$inc": {"count": 1},
            "$set": {"updated_at": now},
            "$setOnInsert": {"created_at": now, "expires_at": now + _LOGIN_FAILURE_WINDOW},
        },
        upsert=True,
    )


def microsoft_sign_in_config() -> Dict[str, Any]:
    """Public Microsoft SSO bootstrap data. Client IDs are not secrets."""
    return {
        "enabled": bool(MICROSOFT_CLIENT_ID),
        "client_id": MICROSOFT_CLIENT_ID or None,
        "tenant": MICROSOFT_TENANT_ID,
    }


async def verify_turnstile(token: Optional[str], remote_ip: Optional[str]) -> bool:
    if not TURNSTILE_SECRET_KEY:
        return True
    if not token:
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                "https://challenges.cloudflare.com/turnstile/v0/siteverify",
                data={"secret": TURNSTILE_SECRET_KEY, "response": token, "remoteip": remote_ip or ""},
            )
        return bool(response.json().get("success"))
    except Exception as exc:
        logger.error("Turnstile verification failed: %s", exc)
        return False


async def signup_user(body: SignupRequest) -> Dict[str, Any]:
    """Register a new user with any valid email address and password."""
    email = str(body.email).strip().lower()

    if await db.users.find_one({"email": email}, {"_id": 0}):
        raise Exception("An account with this email already exists")

    username = (body.username or "").strip() or None
    if username:
        if await db.users.find_one({"username": username}, {"_id": 0}):
            raise Exception("That username is already taken")

    user_id = f"user_{__import__('uuid').uuid4().hex[:12]}"
    user_doc = {
        "user_id": user_id,
        "email": email,
        "name": body.name.strip() or email.split("@")[0],
        "picture": None,
        "password_hash": _hash_password(body.password),
        "gender": None,
        "phone": None,
        "onboarding_completed": False,
        "created_at": datetime.now(timezone.utc),
        "last_login": datetime.now(timezone.utc),
    }
    if username:
        user_doc["username"] = username
    await db.users.insert_one(user_doc)

    session_token = await _create_session_token(user_id)
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return {"session_token": session_token, "user": _with_admin_flag(user_doc)}


async def login_user(body: LoginRequest) -> Dict[str, Any]:
    """Authenticate a user with email/username and password."""
    identifier = body.identifier.strip()
    throttle_key = await _check_login_throttle(identifier)
    user = await db.users.find_one(
        {"$or": [{"email": identifier.lower()}, {"username": identifier}]},
        {"_id": 0}
    )

    if not user or not user.get("password_hash") or not _verify_password(body.password, user["password_hash"]):
        await _record_login_failure(throttle_key)
        raise Exception("Incorrect email/username or password")

    await db.auth_login_attempts.delete_one({"key": throttle_key})
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"last_login": datetime.now(timezone.utc)}}
    )

    session_token = await _create_session_token(user["user_id"])
    user_doc = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    return {"session_token": session_token, "user": _with_admin_flag(user_doc)}


async def google_sign_in(body: GoogleSignIn) -> Dict[str, Any]:
    """Authenticate or register with Google as a regular UniPool account."""
    if not GOOGLE_CLIENT_ID:
        raise RuntimeError("Server missing GOOGLE_CLIENT_ID")
    try:
        idinfo = await asyncio.to_thread(
            google_id_token.verify_oauth2_token,
            body.id_token,
            _GOOGLE_REQUEST,
            GOOGLE_CLIENT_ID,
        )
    except Exception as exc:
        logger.warning("Google token verification failed: %s", exc)
        raise ValueError("Invalid Google token") from exc

    email = idinfo.get("email")
    if not email or not idinfo.get("email_verified", False):
        logger.warning("Google sign-in rejected an unverified or missing email")
        raise ValueError("Google email not verified")

    email = email.strip().lower()
    name = idinfo.get("name") or email.split("@", 1)[0]
    picture = idinfo.get("picture")
    return await _create_session_for_user(email, name, picture)


async def _verify_microsoft_token(body: MicrosoftSignIn) -> dict:
    if not MICROSOFT_CLIENT_ID:
        raise RuntimeError("Microsoft sign-in is not configured")

    try:
        unverified = jwt.decode(body.id_token, options={"verify_signature": False})
        tenant_id = str(unverified.get("tid") or "").strip().lower()
        if not tenant_id:
            raise ValueError("Microsoft token is missing its tenant")
        if tenant_id == _MICROSOFT_CONSUMER_TENANT:
            raise ValueError("Use your Mahindra University work or school Microsoft account")
        if MICROSOFT_TENANT_ID.lower() not in {"organizations", "common"} and tenant_id != MICROSOFT_TENANT_ID.lower():
            raise ValueError("This Microsoft account is not from the configured university tenant")

        signing_key = await asyncio.to_thread(_MICROSOFT_JWKS.get_signing_key_from_jwt, body.id_token)
        claims = jwt.decode(
            body.id_token,
            signing_key.key,
            algorithms=["RS256"],
            audience=MICROSOFT_CLIENT_ID,
            issuer=f"https://login.microsoftonline.com/{tenant_id}/v2.0",
            options={"require": ["exp", "iat", "iss", "aud", "tid", "oid", "nonce"]},
        )
    except ValueError:
        raise
    except Exception as exc:
        logger.warning("Microsoft token verification failed: %s", exc)
        raise ValueError("Invalid Microsoft sign-in token") from exc

    if not body.nonce or not __import__('hmac').compare_digest(str(claims.get("nonce") or ""), body.nonce):
        raise ValueError("Microsoft sign-in session could not be verified")
    return claims


async def microsoft_sign_in(body: MicrosoftSignIn) -> Dict[str, Any]:
    """Authenticate an official MU Microsoft account and verify student identity."""
    claims = await _verify_microsoft_token(body)
    email = str(claims.get("preferred_username") or claims.get("email") or "").strip().lower()
    if not _is_mu_email(email):
        raise ValueError(f"Use your @{MU_EMAIL_DOMAIN} Microsoft university account")

    decoded = decode_roll_number(email.split("@", 1)[0])
    if not decoded:
        raise ValueError("Couldn't recognize your Mahindra University roll number from this Microsoft account")

    tenant_id = str(claims.get("tid") or "").strip().lower()
    object_id = str(claims.get("oid") or "").strip().lower()
    name = str(claims.get("name") or email.split("@", 1)[0]).strip()

    existing_identity = await db.users.find_one(
        {
            "roll_number": decoded["roll_number"],
            "college_verified": True,
            "email": {"$ne": email},
            "$or": [
                {"microsoft_oid": {"$ne": object_id}},
                {"microsoft_tid": {"$ne": tenant_id}},
            ],
        },
        {"_id": 0, "user_id": 1},
    )
    if existing_identity:
        raise ValueError("This college identity is already linked to another UniPool account")

    linked = await db.users.find_one(
        {"microsoft_oid": object_id, "microsoft_tid": tenant_id},
        {"_id": 0, "password_hash": 0},
    )
    if linked:
        user_id = linked["user_id"]
        if linked.get("email") != email:
            email_owner = await db.users.find_one({"email": email, "user_id": {"$ne": user_id}}, {"_id": 0, "user_id": 1})
            if email_owner:
                raise ValueError("This university email is already linked to another UniPool account")
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {
                "email": email,
                "name": name,
                "last_login": datetime.now(timezone.utc),
                "college_verified": True,
                "college_email": email,
                "microsoft_oid": object_id,
                "microsoft_tid": tenant_id,
                **decoded,
            }},
        )
        session_token = await _create_session_token(user_id)
        user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
        return {"session_token": session_token, "user": _with_admin_flag(user_doc)}

    result = await _create_session_for_user(email, name, None)
    verified_fields = {
        "college_verified": True,
        "college_email": email,
        "microsoft_oid": object_id,
        "microsoft_tid": tenant_id,
        **decoded,
    }
    await db.users.update_one(
        {"user_id": result["user"]["user_id"]},
        {"$set": verified_fields},
    )
    result["user"] = _with_admin_flag({**result["user"], **verified_fields})
    return result


async def complete_onboarding(user_id: str) -> Dict[str, Any]:
    """Persist completion of the one-time first-login product tour."""
    now = datetime.now(timezone.utc)
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"onboarding_completed": True, "onboarding_completed_at": now}},
    )
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    if not user_doc:
        raise ValueError("User not found")
    return _with_admin_flag(user_doc)


async def logout_user(session_token: str) -> bool:
    result = await db.user_sessions.delete_one({"session_token": session_token})
    return result.deleted_count > 0


async def get_current_user(session_token: str) -> Optional[Dict[str, Any]]:
    """Get current user from session token."""
    if not session_token or not session_token.lower().startswith("bearer "):
        return None

    token = session_token.split(" ", 1)[1].strip()
    session = await db.user_sessions.find_one(
        {"session_token": token}, {"_id": 0}
    )

    if not session:
        return None

    expires_at = _ensure_aware(session["expires_at"])
    if expires_at < _now_utc():
        return None

    user = await db.users.find_one(
        {"user_id": session["user_id"]},
        {"_id": 0, "password_hash": 0}
    )

    if not user:
        return None

    await db.users.update_one(
        {"user_id": session["user_id"]},
        {"$set": {"last_seen": _now_utc()}}
    )

    return _with_admin_flag(user)


def _ensure_aware(dt: datetime) -> datetime:
    """Ensure datetime is timezone aware."""
    if dt.tzinfo is None or dt.tzinfo.utcoffset(dt) is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _now_utc() -> datetime:
    """Get current UTC datetime."""
    return datetime.now(timezone.utc)
