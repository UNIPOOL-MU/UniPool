"""Authentication helper functions."""

import bcrypt
from datetime import datetime, timedelta, timezone
from typing import Optional
import uuid

from config.database import db
from config.settings import (
    ADMIN_EMAILS,
    SEED_ADMIN_EMAIL,
    SEED_ADMIN_PASSWORD,
    SEED_ADMIN_USERNAME,
    SESSION_EXPIRE_DAYS,
)

_DEFAULT_SEED = (
    "admin@unipool.app",
    "admin",
    "securepassword123",
)


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except Exception:
        return False


async def _create_session_token(user_id: str) -> str:
    session_token = uuid.uuid4().hex
    expires_at = datetime.now(timezone.utc) + timedelta(days=SESSION_EXPIRE_DAYS)
    await db.user_sessions.insert_one(
        {
            "session_token": session_token,
            "user_id": user_id,
            "expires_at": expires_at,
            "created_at": datetime.now(timezone.utc),
        }
    )
    return session_token


async def _create_session_for_user(
    email: str, name: str, picture: Optional[str]
) -> dict:
    existing_user = await db.users.find_one(
        {"email": email}, {"_id": 0, "password_hash": 0}
    )
    if existing_user:
        user_id = existing_user["user_id"]
        fields = {
            "name": name,
            "last_login": datetime.now(timezone.utc),
        }
        if picture is not None:
            fields["picture"] = picture
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": fields},
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one(
            {
                "user_id": user_id,
                "email": email,
                "username": None,
                "name": name,
                "picture": picture,
                "gender": None,
                "phone": None,
                "password_hash": "",
                "onboarding_completed": False,
                "created_at": datetime.now(timezone.utc),
                "last_login": datetime.now(timezone.utc),
            }
        )

    session_token = await _create_session_token(user_id)
    user_doc = await db.users.find_one(
        {"user_id": user_id}, {"_id": 0, "password_hash": 0}
    )
    return {"session_token": session_token, "user": _with_admin_flag(user_doc)}


def _seed_admin_is_explicit() -> bool:
    """The old hard-coded demo credentials must never grant admin in production."""
    if not (SEED_ADMIN_EMAIL and SEED_ADMIN_USERNAME and SEED_ADMIN_PASSWORD):
        return False
    return (
        SEED_ADMIN_EMAIL,
        SEED_ADMIN_USERNAME,
        SEED_ADMIN_PASSWORD,
    ) != _DEFAULT_SEED


def _with_admin_flag(user_doc: dict) -> dict:
    user = user_doc.copy()

    is_default_seed_identity = (
        str(user.get("email") or "").lower() == _DEFAULT_SEED[0]
        and user.get("username") == _DEFAULT_SEED[1]
        and not _seed_admin_is_explicit()
    )

    configured_seed_admin = _seed_admin_is_explicit() and (
        str(user.get("email") or "").lower() == SEED_ADMIN_EMAIL.lower()
        or user.get("username") == SEED_ADMIN_USERNAME
    )

    explicit_override = user.get("is_admin_override") is True and not is_default_seed_identity
    is_admin = (
        str(user.get("email") or "").lower() in ADMIN_EMAILS
        or configured_seed_admin
        or explicit_override
    )
    user["is_admin"] = is_admin
    # Accounts created before the first-login tour existed do not have this
    # field. Treat them as not-yet-onboarded so they get the tour once rather
    # than silently skipping it forever.
    user["onboarding_completed"] = user.get("onboarding_completed") is True
    return user