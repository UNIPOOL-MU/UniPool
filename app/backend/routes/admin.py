"""
Admin routes.
Handles administrative operations (requires admin privileges).
"""

import sys
from pathlib import Path

# Add the backend directory to the Python path so we can import from it
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Literal
from datetime import datetime, timezone
from typing import List, Optional
from config.database import db
from services.admin_service import (
    require_admin, get_admin_stats, list_admin_pools,
    admin_delete_pool, migrate_ratings_scale, refresh_college_info,
    list_admin_reports, admin_resolve_report, submit_game_score,
    get_game_leaderboard, get_trivia_questions
)
from models.auth import GameScoreSubmit
from models.response import BaseResponse
import logging

logger = logging.getLogger("unipool.routes.admin")

# Create router
router = APIRouter(prefix="/admin", tags=["admin"])

@router.get("/people", response_model=List[dict])
async def admin_list_people_endpoint(authorization: Optional[str] = Header(None)):
    """Return the complete people directory for the dedicated admin console."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    try:
        await require_admin(user)
        # Keep the directory response deliberately small and JSON-safe.  In
        # particular, never leak credential fields to the admin UI and avoid
        # serialising provider-specific Mongo fields that can break the mobile
        # client when a legacy record is encountered.
        projection = {
            "_id": 0, "password_hash": 0, "session_token": 0,
            "email_verification_token": 0, "reset_token": 0,
        }
        return await db.users.find({}, projection).sort("created_at", -1).limit(1000).to_list(1000)
    except HTTPException:
        raise
    except Exception as e:
        if "Admin access required" in str(e): raise HTTPException(status_code=403, detail=str(e))
        logger.warning("Admin people list failed: %s", e)
        raise HTTPException(status_code=500, detail="Could not load people")


@router.get("/stats", response_model=dict)
async def admin_stats_endpoint(authorization: Optional[str] = Header(None)):
    """Get platform statistics (admin only)."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")

    try:
        user = await get_current_user(authorization)
        if not user:
            raise HTTPException(status_code=401, detail="Invalid or expired session")

        stats = await get_admin_stats(user)
        return stats
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Admin stats failed: {e}")
        if "Admin access required" in str(e):
            raise HTTPException(status_code=403, detail=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pools", response_model=List[dict])
async def admin_list_pools_endpoint(authorization: Optional[str] = Header(None)):
    """Get all pools (admin only)."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")

    try:
        user = await get_current_user(authorization)
        if not user:
            raise HTTPException(status_code=401, detail="Invalid or expired session")

        pools = await list_admin_pools(user)
        return pools
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Admin list pools failed: {e}")
        if "Admin access required" in str(e):
            raise HTTPException(status_code=403, detail=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/pools/{pool_id}", response_model=BaseResponse)
async def admin_delete_pool_endpoint(
    pool_id: str,
    authorization: Optional[str] = Header(None)
):
    """Delete any pool (admin only)."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")

    try:
        user = await get_current_user(authorization)
        if not user:
            raise HTTPException(status_code=401, detail="Invalid or expired session")

        success = await admin_delete_pool(user, pool_id)
        if not success:
            raise HTTPException(status_code=404, detail="Pool not found")

        return BaseResponse()
    except Exception as e:
        logger.warning(f"Admin delete pool failed: {e}")
        if "Pool not found" in str(e):
            raise HTTPException(status_code=404, detail=str(e))
        if "Admin access required" in str(e):
            raise HTTPException(status_code=403, detail=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/migrate-ratings-scale", response_model=BaseResponse)
async def admin_migrate_ratings_scale_endpoint(authorization: Optional[str] = Header(None)):
    """Migrate old rating scale to new rating scale (admin only)."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")

    try:
        user = await get_current_user(authorization)
        if not user:
            raise HTTPException(status_code=401, detail="Invalid or expired session")

        result = await migrate_ratings_scale(user)
        return BaseResponse(**result)
    except Exception as e:
        logger.warning(f"Admin migrate ratings scale failed: {e}")
        if "Admin access required" in str(e):
            raise HTTPException(status_code=403, detail=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/refresh-college-info", response_model=BaseResponse)
async def admin_refresh_college_info_endpoint(authorization: Optional[str] = Header(None)):
    """Refresh college verification information (admin only)."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization_header")

    try:
        user = await get_current_user(authorization)
        if not user:
            raise HTTPException(status_code=401, detail="Invalid or expired session")

        result = await refresh_college_info(user)
        return BaseResponse(**result)
    except Exception as e:
        logger.warning(f"Admin refresh college info failed: {e}")
        if "Admin access required" in str(e):
            raise HTTPException(status_code=403, detail=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/reports", response_model=List[dict])
async def admin_list_reports_endpoint(authorization: Optional[str] = Header(None)):
    """Get all reports (admin only)."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")

    try:
        user = await get_current_user(authorization)
        if not user:
            raise HTTPException(status_code=401, detail="Invalid or expired session")

        reports = await list_admin_reports(user)
        return reports
    except Exception as e:
        logger.warning(f"Admin list reports failed: {e}")
        if "Admin access required" in str(e):
            raise HTTPException(status_code=403, detail=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/reports/{report_id}/resolve", response_model=BaseResponse)
async def admin_resolve_report_endpoint(
    report_id: str,
    authorization: Optional[str] = Header(None)
):
    """Resolve a report (admin only)."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")

    try:
        user = await get_current_user(authorization)
        if not user:
            raise HTTPException(status_code=401, detail="Invalid or expired session")

        success = await admin_resolve_report(user, report_id)
        if not success:
            raise HTTPException(status_code=404, detail="Report not found")

        return BaseResponse()
    except Exception as e:
        logger.warning(f"Admin resolve report failed: {e}")
        if "Report not found" in str(e):
            raise HTTPException(status_code=404, detail=str(e))
        if "Admin access required" in str(e):
            raise HTTPException(status_code=403, detail=str(e))
        raise HTTPException(status_code=500, detail=str(e))


# Game score submission route (available to all users, not just admin)
@router.post("/games/score", response_model=dict)
async def submit_game_score_endpoint(
    body: GameScoreSubmit,
    authorization: Optional[str] = Header(None)
):
    """Submit a game score."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")

    try:
        user = await get_current_user(authorization)
        if not user:
            raise HTTPException(status_code=401, detail="Invalid or expired session")

        result = await submit_game_score(user, body.dict())
        return result
    except Exception as e:
        logger.warning(f"Submit game score failed: {e}")
        if "Unknown game" in str(e):
            raise HTTPException(status_code=404, detail=str(e))
        if "Admin access required" in str(e):  # This shouldn't happen for game scores
            raise HTTPException(status_code=403, detail=str(e))
        raise HTTPException(status_code=500, detail=str(e))


# Game leaderboard routes (available to all users)
@router.get("/games/leaderboard/{game}", response_model=List[dict])
async def get_game_leaderboard_endpoint(
    game: str,
    authorization: Optional[str] = Header(None)
):
    """Get leaderboard for a specific game."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")

    try:
        # Note: Game leaderboards don't require authentication for public viewing
        # But we'll still validate the token if provided
        user = None
        if authorization:
            try:
                user = await get_current_user(authorization)
            except:
                pass  # Allow public access even if token is invalid/missing

        leaderboard = await get_game_leaderboard(game)
        return leaderboard
    except Exception as e:
        logger.warning(f"Get game leaderboard failed: {e}")
        if "Unknown game" in str(e):
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/trivia", response_model=List[dict])
async def get_trivia_endpoint(authorization: Optional[str] = Header(None)):
    """Get trivia questions."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")

    try:
        # Note: Trivia is publicly accessible
        user = None
        if authorization:
            try:
                user = await get_current_user(authorization)
            except:
                pass  # Allow public access even if token is invalid/missing

        trivia_questions = await get_trivia_questions()
        return trivia_questions
    except Exception as e:
        logger.warning(f"Get trivia failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Helper function to get current user (imported from auth service)
async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    """Get current user from authorization header."""
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    from services.auth_service import get_current_user as get_user_from_session
    return await get_user_from_session(authorization)


# Export the router
__all__ = ["router"]

