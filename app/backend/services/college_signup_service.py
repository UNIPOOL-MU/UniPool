"""Verified Mahindra University email signup flow."""

import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from config.database import db
from helpers.auth_helper import _create_session_token, _hash_password, _with_admin_flag
from helpers.email_helper import college_verification_email_html, send_email
from helpers.roll_number_decoder import decode_roll_number
from models.user import CollegeSignupConfirm, CollegeSignupStart

MU_EMAIL_DOMAIN = "mahindrauniversity.edu.in"
CHALLENGE_TTL_MINUTES = 15
RESEND_COOLDOWN_SECONDS = 60
MAX_ATTEMPTS = 5


def is_mu_college_email(email: str) -> bool:
    normalized = (email or "").strip().lower()
    return normalized.endswith(f"@{MU_EMAIL_DOMAIN}") and normalized.count("@") == 1


def _normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def _decode_email(email: str) -> dict:
    if not is_mu_college_email(email):
        raise ValueError(f"Use your @{MU_EMAIL_DOMAIN} email for verified college signup")
    local_part = email.split("@", 1)[0]
    decoded = decode_roll_number(local_part)
    if not decoded:
        raise ValueError("Couldn't recognize your Mahindra University roll number from this email")
    return decoded


def _code_hash(challenge_id: str, code: str) -> str:
    return hashlib.sha256(f"{challenge_id}:{code}".encode("utf-8")).hexdigest()


def _aware(value: datetime) -> datetime:
    if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
        return value.replace(tzinfo=timezone.utc)
    return value


async def start_college_signup(body: CollegeSignupStart) -> Dict[str, Any]:
    """Send a six-digit OTP before an MU email account is created."""
    now = datetime.now(timezone.utc)
    email = _normalize_email(str(body.email))
    decoded = _decode_email(email)
    username = (body.username or "").strip() or None
    name = body.name.strip()

    if not name:
        raise ValueError("Please enter your name")
    if await db.users.find_one({"email": email}, {"_id": 0, "user_id": 1}):
        raise ValueError("An account with this email already exists")
    if username and await db.users.find_one({"username": username}, {"_id": 0, "user_id": 1}):
        raise ValueError("That username is already taken")
    if await db.users.find_one(
        {"roll_number": decoded["roll_number"], "college_verified": True},
        {"_id": 0, "user_id": 1},
    ):
        raise ValueError("This college identity is already verified on another UniPool account")

    await db.college_signup_challenges.delete_many({"expires_at": {"$lt": now}})
    recent = await db.college_signup_challenges.find_one(
        {"email": email, "created_at": {"$gte": now - timedelta(seconds=RESEND_COOLDOWN_SECONDS)}},
        {"_id": 0, "challenge_id": 1},
    )
    if recent:
        raise ValueError("A verification code was sent recently. Please wait a minute before requesting another")

    challenge_id = secrets.token_urlsafe(24)
    code = f"{secrets.randbelow(1_000_000):06d}"
    expires_at = now + timedelta(minutes=CHALLENGE_TTL_MINUTES)
    challenge = {
        "challenge_id": challenge_id,
        "email": email,
        "name": name,
        "username": username,
        "password_hash": _hash_password(body.password),
        "code_hash": _code_hash(challenge_id, code),
        "attempts": 0,
        "created_at": now,
        "expires_at": expires_at,
        "decoded_profile": decoded,
    }
    await db.college_signup_challenges.insert_one(challenge)

    sent = await send_email(
        email,
        "UniPool: Verify your college signup",
        college_verification_email_html(code, email),
    )
    if not sent:
        await db.college_signup_challenges.delete_one({"challenge_id": challenge_id})
        raise RuntimeError("Couldn't send the college verification code right now. Please try again")

    return {
        "challenge_id": challenge_id,
        "email": email,
        "expires_in_seconds": CHALLENGE_TTL_MINUTES * 60,
        "student_preview": {
            "roll_number": decoded.get("roll_number"),
            "school_name": decoded.get("school_name"),
            "branch_name": decoded.get("branch_name"),
            "degree_level_name": decoded.get("degree_level_name"),
            "batch_year": decoded.get("batch_year"),
        },
    }


async def confirm_college_signup(body: CollegeSignupConfirm) -> Dict[str, Any]:
    """Create the verified account only after the mailbox OTP is correct."""
    now = datetime.now(timezone.utc)
    challenge = await db.college_signup_challenges.find_one(
        {"challenge_id": body.challenge_id}, {"_id": 0}
    )
    if not challenge:
        raise ValueError("No active college signup verification was found. Please request a new code")
    if _aware(challenge["expires_at"]) < now:
        await db.college_signup_challenges.delete_one({"challenge_id": body.challenge_id})
        raise ValueError("Verification code expired. Please request a new code")
    if int(challenge.get("attempts", 0)) >= MAX_ATTEMPTS:
        raise ValueError("Too many verification attempts. Please request a new code")

    expected = str(challenge.get("code_hash") or "")
    supplied = _code_hash(body.challenge_id, body.code)
    if not hmac.compare_digest(expected, supplied):
        await db.college_signup_challenges.update_one(
            {"challenge_id": body.challenge_id}, {"$inc": {"attempts": 1}}
        )
        raise ValueError("Invalid verification code")

    email = challenge["email"]
    username = challenge.get("username")
    decoded = challenge.get("decoded_profile") or _decode_email(email)

    if await db.users.find_one({"email": email}, {"_id": 0, "user_id": 1}):
        raise ValueError("An account with this email already exists")
    if username and await db.users.find_one({"username": username}, {"_id": 0, "user_id": 1}):
        raise ValueError("That username is already taken")
    if await db.users.find_one(
        {"roll_number": decoded["roll_number"], "college_verified": True},
        {"_id": 0, "user_id": 1},
    ):
        raise ValueError("This college identity is already verified on another UniPool account")

    user_id = f"user_{uuid.uuid4().hex[:12]}"
    user_doc = {
        "user_id": user_id,
        "email": email,
        "college_email": email,
        "name": challenge["name"],
        "picture": None,
        "gender": None,
        "phone": None,
        "blood_group": None,
        "password_hash": challenge["password_hash"],
        "college_verified": True,
        "onboarding_completed": False,
        **decoded,
        "created_at": now,
        "last_login": now,
    }
    if username:
        user_doc["username"] = username
    await db.users.insert_one(user_doc)
    await db.college_signup_challenges.delete_one({"challenge_id": body.challenge_id})

    session_token = await _create_session_token(user_id)
    safe_user = {k: v for k, v in user_doc.items() if k != "password_hash"}
    return {"session_token": session_token, "user": _with_admin_flag(safe_user)}
