"""Verified signup flow for any email/password UniPool account."""

import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from config.database import db
from helpers.auth_helper import _create_session_token, _hash_password, _with_admin_flag
from helpers.email_helper import send_email, signup_verification_email_html
from models.user import SignupRequest, EmailSignupConfirm

CHALLENGE_TTL_MINUTES = 15
RESEND_COOLDOWN_SECONDS = 60
MAX_ATTEMPTS = 5


def _normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def _code_hash(challenge_id: str, code: str) -> str:
    return hashlib.sha256(f"{challenge_id}:{code}".encode("utf-8")).hexdigest()


def _aware(value: datetime) -> datetime:
    if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
        return value.replace(tzinfo=timezone.utc)
    return value


async def start_email_signup(body: SignupRequest) -> Dict[str, Any]:
    """Send a six-digit OTP before creating a regular email/password account."""
    now = datetime.now(timezone.utc)
    email = _normalize_email(str(body.email))
    name = body.name.strip()
    username = (body.username or "").strip() or None

    if await db.users.find_one({"email": email}, {"_id": 0, "user_id": 1}):
        raise ValueError("An account with this email already exists")
    if username and await db.users.find_one({"username": username}, {"_id": 0, "user_id": 1}):
        raise ValueError("That username is already taken")

    await db.email_signup_challenges.delete_many({"expires_at": {"$lt": now}})
    recent = await db.email_signup_challenges.find_one(
        {"email": email, "created_at": {"$gte": now - timedelta(seconds=RESEND_COOLDOWN_SECONDS)}},
        {"_id": 0, "challenge_id": 1},
    )
    if recent:
        raise ValueError("A verification code was sent recently. Please wait a minute before requesting another")

    challenge_id = secrets.token_urlsafe(24)
    code = f"{secrets.randbelow(1_000_000):06d}"
    challenge = {
        "challenge_id": challenge_id,
        "email": email,
        "name": name,
        "username": username,
        "password_hash": _hash_password(body.password),
        "code_hash": _code_hash(challenge_id, code),
        "attempts": 0,
        "created_at": now,
        "expires_at": now + timedelta(minutes=CHALLENGE_TTL_MINUTES),
    }
    await db.email_signup_challenges.insert_one(challenge)

    sent = await send_email(
        email,
        "UniPool: Verify your email",
        signup_verification_email_html(code, email),
    )
    if not sent:
        await db.email_signup_challenges.delete_one({"challenge_id": challenge_id})
        raise RuntimeError("Couldn't send the verification code right now. Please try again")

    return {"challenge_id": challenge_id, "email": email, "expires_in_seconds": CHALLENGE_TTL_MINUTES * 60}


async def confirm_email_signup(body: EmailSignupConfirm) -> Dict[str, Any]:
    """Create and sign in the account only after the mailbox OTP is correct."""
    now = datetime.now(timezone.utc)
    challenge = await db.email_signup_challenges.find_one({"challenge_id": body.challenge_id}, {"_id": 0})
    if not challenge:
        raise ValueError("No active signup verification was found. Please request a new code")

    # A browser can lose the response after the account was successfully
    # created (mobile networks / sleeping Render instances / transient CORS).
    # Keep completed challenges briefly so retrying the same OTP is safe and
    # returns a fresh session instead of stranding the user.
    completed_user_id = challenge.get("completed_user_id")
    if completed_user_id:
        completed_user = await db.users.find_one(
            {"user_id": completed_user_id, "account_deleted": {"$ne": True}},
            {"_id": 0, "password_hash": 0},
        )
        if not completed_user:
            raise ValueError("This signup was completed but the account is unavailable")
        session_token = await _create_session_token(completed_user_id)
        return {"session_token": session_token, "user": _with_admin_flag(completed_user)}

    if _aware(challenge["expires_at"]) < now:
        await db.email_signup_challenges.delete_one({"challenge_id": body.challenge_id})
        raise ValueError("Verification code expired. Please request a new code")
    if int(challenge.get("attempts", 0)) >= MAX_ATTEMPTS:
        raise ValueError("Too many verification attempts. Please request a new code")

    expected = str(challenge.get("code_hash") or "")
    supplied = _code_hash(body.challenge_id, body.code)
    if not hmac.compare_digest(expected, supplied):
        await db.email_signup_challenges.update_one(
            {"challenge_id": body.challenge_id},
            {"$inc": {"attempts": 1}},
        )
        raise ValueError("Invalid verification code")

    email = challenge["email"]
    username = challenge.get("username")
    if await db.users.find_one({"email": email}, {"_id": 0, "user_id": 1}):
        raise ValueError("An account with this email already exists")
    if username and await db.users.find_one({"username": username}, {"_id": 0, "user_id": 1}):
        raise ValueError("That username is already taken")

    user_id = f"user_{uuid.uuid4().hex[:12]}"
    user_doc = {
        "user_id": user_id,
        "email": email,
        "email_verified": True,
        "name": challenge["name"],
        "picture": None,
        "gender": None,
        "phone": None,
        "password_hash": challenge["password_hash"],
        "onboarding_completed": False,
        "created_at": now,
        "last_login": now,
    }
    if username:
        user_doc["username"] = username

    await db.users.insert_one(user_doc)
    # Mark the challenge completed instead of deleting it immediately. The TTL
    # index still removes it automatically; this makes confirmation retries
    # idempotent when the browser loses the first successful response.
    await db.email_signup_challenges.update_one(
        {"challenge_id": body.challenge_id},
        {
            "$set": {
                "completed_user_id": user_id,
                "completed_at": now,
                "expires_at": now + timedelta(minutes=CHALLENGE_TTL_MINUTES),
            },
            "$unset": {"password_hash": "", "code_hash": ""},
        },
    )
    session_token = await _create_session_token(user_id)
    safe_user = {k: v for k, v in user_doc.items() if k != "password_hash"}
    return {"session_token": session_token, "user": _with_admin_flag(safe_user)}
