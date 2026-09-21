"""Authentication routes for UniPool."""

from fastapi import APIRouter, HTTPException, Header, Request
from typing import Optional
import logging

from config.database import db
from helpers.auth_helper import _hash_password, _verify_password
from services.auth_service import (
    login_user, google_sign_in, microsoft_sign_in, delete_account,
    microsoft_sign_in_config, complete_onboarding,
    logout_user, get_current_user, verify_turnstile,
)
from services.college_signup_service import start_college_signup, confirm_college_signup
from services.email_signup_service import start_email_signup, confirm_email_signup
from services.user_service import start_college_verification, confirm_college_verification
from helpers.college_helper import sync_user_college_profile
from models.auth import GoogleSignIn, MicrosoftSignIn
from models.user import (
    SignupRequest,
    EmailSignupConfirm,
    AccountDeleteRequest,
    LoginRequest,
    PasswordSetRequest,
    CollegeVerifyStart,
    CollegeVerifyConfirm,
    CollegeSignupStart,
    CollegeSignupConfirm,
)
from models.response import BaseResponse

logger = logging.getLogger("unipool.routes.auth")
router = APIRouter(prefix="/auth", tags=["authentication"])


async def _sync_result_user(result: dict) -> dict:
    if result and result.get("user"):
        result["user"] = await sync_user_college_profile(result["user"])
    return result


async def _require_user(authorization: Optional[str]) -> dict:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return user


@router.post("/signup", response_model=dict)
async def signup(body: SignupRequest, request: Request):
    """Send a verification code before creating a regular email/password account."""
    try:
        if not await verify_turnstile(body.turnstile_token, request.client.host if request.client else None):
            raise HTTPException(status_code=400, detail="Bot check failed - please try again.")
        return await start_email_signup(body)
    except HTTPException:
        raise
    except ValueError as e:
        logger.info("Email signup start rejected: %s", e)
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        logger.warning("Email signup delivery unavailable: %s", e)
        raise HTTPException(status_code=503, detail=str(e))
    except Exception:
        logger.exception("Unexpected email signup start failure")
        raise HTTPException(status_code=500, detail="Could not start email signup")


@router.post("/signup/confirm", response_model=dict)
async def signup_confirm(body: EmailSignupConfirm):
    """Create and sign in a regular account after its email OTP is correct."""
    try:
        return await _sync_result_user(await confirm_email_signup(body))
    except ValueError as e:
        logger.info("Email signup confirmation rejected: %s", e)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("Unexpected email signup confirmation failure")
        raise HTTPException(status_code=500, detail="Could not complete email signup")


@router.post("/signup/college/start", response_model=dict)
async def college_signup_start(body: CollegeSignupStart, request: Request):
    """Send an OTP to an MU mailbox before creating the verified account."""
    try:
        if not await verify_turnstile(body.turnstile_token, request.client.host if request.client else None):
            raise HTTPException(status_code=400, detail="Bot check failed - please try again.")
        return await start_college_signup(body)
    except HTTPException:
        raise
    except ValueError as e:
        logger.info("College signup start rejected: %s", e)
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        logger.warning("College signup email unavailable: %s", e)
        raise HTTPException(status_code=503, detail=str(e))
    except Exception:
        logger.exception("Unexpected college signup start failure")
        raise HTTPException(status_code=500, detail="Could not start college signup")


@router.post("/signup/college/confirm", response_model=dict)
async def college_signup_confirm(body: CollegeSignupConfirm):
    """Create and sign in a verified student after the mailbox OTP is correct."""
    try:
        return await _sync_result_user(await confirm_college_signup(body))
    except ValueError as e:
        logger.info("College signup confirmation rejected: %s", e)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("Unexpected college signup confirmation failure")
        raise HTTPException(status_code=500, detail="Could not complete college signup")


@router.post("/login", response_model=dict)
async def login(body: LoginRequest, request: Request):
    try:
        if not await verify_turnstile(body.turnstile_token, request.client.host if request.client else None):
            raise HTTPException(status_code=400, detail="Bot check failed - please try again.")
        return await _sync_result_user(await login_user(body))
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("Login failed: %s", e)
        raise HTTPException(status_code=401, detail=str(e))


@router.post("/google", response_model=dict)
async def google_sign_in_route(body: GoogleSignIn):
    try:
        return await _sync_result_user(await google_sign_in(body))
    except RuntimeError as e:
        logger.error("Google sign-in configuration error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
    except ValueError as e:
        logger.warning("Google sign-in rejected: %s", e)
        raise HTTPException(status_code=401, detail=str(e))
    except Exception:
        logger.exception("Unexpected Google sign-in failure")
        raise HTTPException(status_code=500, detail="Google sign-in failed")


@router.get("/microsoft/config", response_model=dict)
async def microsoft_config_route():
    """Return public Microsoft OAuth bootstrap settings for the SPA."""
    return microsoft_sign_in_config()


@router.post("/microsoft", response_model=dict)
async def microsoft_sign_in_route(body: MicrosoftSignIn):
    try:
        return await _sync_result_user(await microsoft_sign_in(body))
    except RuntimeError as e:
        logger.error("Microsoft sign-in configuration error: %s", e)
        raise HTTPException(status_code=503, detail=str(e))
    except ValueError as e:
        logger.warning("Microsoft sign-in rejected: %s", e)
        raise HTTPException(status_code=401, detail=str(e))
    except Exception:
        logger.exception("Unexpected Microsoft sign-in failure")
        raise HTTPException(status_code=500, detail="Microsoft sign-in failed")


@router.get("/password/status", response_model=dict)
async def password_status_route(authorization: Optional[str] = Header(None)):
    user = await _require_user(authorization)
    stored = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 1})
    return {"has_password": bool((stored or {}).get("password_hash"))}


@router.post("/password", response_model=dict)
async def set_password_route(body: PasswordSetRequest, authorization: Optional[str] = Header(None)):
    user = await _require_user(authorization)
    stored = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 1})
    if not stored:
        raise HTTPException(status_code=404, detail="Account not found")

    current_hash = str(stored.get("password_hash") or "")
    if current_hash:
        if not body.current_password:
            raise HTTPException(status_code=400, detail="Enter your current password before changing it")
        if not _verify_password(body.current_password, current_hash):
            raise HTTPException(status_code=400, detail="Current password is incorrect")

    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"password_hash": _hash_password(body.new_password)}},
    )
    return {"ok": True, "has_password": True}


@router.post("/onboarding/complete", response_model=dict)
async def onboarding_complete_route(authorization: Optional[str] = Header(None)):
    user = await _require_user(authorization)
    try:
        return await sync_user_college_profile(await complete_onboarding(user["user_id"]))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception:
        logger.exception("Could not complete onboarding")
        raise HTTPException(status_code=500, detail="Could not save tour completion")


@router.get("/me", response_model=dict)
async def get_current_user_info(authorization: Optional[str] = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    try:
        user = await get_current_user(authorization)
        if not user:
            raise HTTPException(status_code=401, detail="Invalid or expired session")
        return await sync_user_college_profile(user)
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("Get current user failed: %s", e)
        raise HTTPException(status_code=401, detail=str(e))


@router.delete("/account", response_model=BaseResponse)
async def delete_account_route(body: AccountDeleteRequest, authorization: Optional[str] = Header(None)):
    """Permanently remove the signed-in account and its private data."""
    user = await _require_user(authorization)
    try:
        deleted = await delete_account(user["user_id"])
        if not deleted:
            raise HTTPException(status_code=404, detail="Account not found")
        return BaseResponse()
    except HTTPException:
        raise
    except Exception:
        logger.exception("Account deletion failed")
        raise HTTPException(status_code=500, detail="Could not delete account right now")


@router.post("/logout", response_model=BaseResponse)
async def logout_route(authorization: Optional[str] = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    try:
        token = authorization.split(" ", 1)[1].strip() if authorization.lower().startswith("bearer ") else authorization
        if not await logout_user(token):
            raise HTTPException(status_code=401, detail="Invalid session")
        return BaseResponse()
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("Logout failed: %s", e)
        raise HTTPException(status_code=401, detail=str(e))


@router.post("/profile/verify-college-id/start", response_model=BaseResponse)
async def verify_college_id_start(body: CollegeVerifyStart, authorization: Optional[str] = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    try:
        user = await get_current_user(authorization)
        if not user:
            raise HTTPException(status_code=401, detail="Invalid or expired session")
        if not await start_college_verification(user["user_id"], body):
            raise HTTPException(status_code=500, detail="Failed to send verification email")
        return BaseResponse()
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("College verification start failed: %s", e)
        if "Please enter your" in str(e) or "Couldn't recognize" in str(e) or "already verified" in str(e):
            raise HTTPException(status_code=400, detail=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/profile/verify-college-id/confirm", response_model=dict)
async def verify_college_id_confirm(body: CollegeVerifyConfirm, authorization: Optional[str] = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    try:
        user = await get_current_user(authorization)
        if not user:
            raise HTTPException(status_code=401, detail="Invalid or expired session")
        result = await confirm_college_verification(user["user_id"], body)
        refreshed = await get_current_user(authorization)
        if refreshed:
            result["user"] = await sync_user_college_profile(refreshed)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("College verification confirm failed: %s", e)
        if any(text in str(e) for text in ("No verification request found", "expired", "Too many attempts", "Invalid verification code")):
            raise HTTPException(status_code=400, detail=str(e))
        raise HTTPException(status_code=500, detail=str(e))


__all__ = ["router"]