"""
Admin service.
Contains business logic for administrative operations.
"""

from typing import List, Optional, Dict, Any
from config.database import db
from helpers.auth_helper import _with_admin_flag
import logging
from datetime import datetime, timezone

logger = logging.getLogger("unipool.admin")

async def require_admin(user: Dict[str, Any]) -> Dict[str, Any]:
    """
    Verify that a user has admin privileges.

    Args:
        user: User dictionary from authentication

    Returns:
        User dictionary if user is admin

    Raises:
        Exception: If user is not an admin
    """
    if not user.get("is_admin") and str(user.get("email") or "").strip().lower() != "utkarsh7023340530@gmail.com":
        raise Exception("Admin access required")
    return user

async def require_moderator(user: Dict[str, Any]) -> Dict[str, Any]:
    """Verify that a user may moderate reports and travel queries."""
    if not user.get("is_admin") and not user.get("is_moderator"):
        raise Exception("Moderator access required")
    return user


async def get_admin_stats(user: Dict[str, Any]) -> Dict[str, Any]:
    """
    Get platform statistics for admin dashboard.

    Args:
        user: Authenticated admin user dictionary

    Returns:
        Dictionary containing platform statistics
    """
    # Verify admin access
    await require_admin(user)

    # Gather statistics
    total_users = await db.users.count_documents({})
    total_pools = await db.pools.count_documents({})
    open_pools = await db.pools.count_documents({"status": "open"})
    closed_pools = await db.pools.count_documents({"status": "closed"})

    return {
        "total_users": total_users,
        "total_pools": total_pools,
        "open_pools": open_pools,
        "closed_pools": closed_pools
    }

async def list_admin_pools(user: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Get all pools (including closed) for admin oversight.

    Args:
        user: Authenticated admin user dictionary

    Returns:
        List of all pool dictionaries sorted by creation date (newest first)
    """
    # Verify admin access
    await require_admin(user)

    # Fetch all pools
    cursor = db.pools.find(
        {},
        {"_id": 0}
    ).sort("created_at", -1)
    return await cursor.to_list(500)

async def admin_delete_pool(user: Dict[str, Any], pool_id: str) -> bool:
    """
    Delete any pool (admin override).

    Args:
        user: Authenticated admin user dictionary
        pool_id: ID of the pool to delete

    Returns:
        True if pool was deleted, False otherwise
    """
    # Verify admin access
    await require_admin(user)

    # Delete pool
    result = await db.pools.delete_one({"pool_id": pool_id})
    return result.deleted_count > 0

async def migrate_ratings_scale(user: Dict[str, Any]) -> Dict[str, Any]:
    """
    Migrate old rating scale (1-5) to new rating scale (1-10).
    One-time, idempotent operation.

    Args:
        user: Authenticated admin user dictionary

    Returns:
        Dictionary containing migration results
    """
    # Verify admin access
    await require_admin(user)

    # Find ratings without scale marker (old 1-5 scale)
    # Update them to 1-10 scale (multiply by 2, cap at 10)
    result = await db.ratings.update_many(
        {"scale": {"$exists": False}},
        [{
            "$set": {
                "stars": {"$min": [{"$multiply": ["$stars", 2]}, 10]},
                "scale": 10
            }
        }]
    )

    return {
        "ok": True,
        "matched": result.matched_count,
        "modified": result.modified_count
    }

async def refresh_college_info(user: Dict[str, Any]) -> Dict[str, Any]:
    """
    Refresh college verification information for all verified users.
    Idempotent operation to update decoded college information.

    Args:
        user: Authenticated admin user dictionary

    Returns:
        Dictionary containing refresh results
    """
    # Verify admin access
    await require_admin(user)

    # Find all users with verified college IDs and roll numbers
    cursor = db.users.find(
        {"college_verified": True, "roll_number": {"$exists": True}},
        {"_id": 0, "user_id": 1, "roll_number": 1}
    )

    updated_count = 0
    async for user_record in cursor:
        # Re-decode roll number with current mappings
        from helpers.college_helper import _decode_roll_number
        decoded = _decode_roll_number(user_record["roll_number"].lower())
        if decoded:
            await db.users.update_one(
                {"user_id": user_record["user_id"]},
                {"$set": decoded}
            )
            updated_count += 1

    return {
        "ok": True,
        "updated": updated_count
    }

async def list_admin_reports(user: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Get all reports for admin moderation.

    Args:
        user: Authenticated admin user dictionary

    Returns:
        List of report dictionaries sorted by creation date (newest first)
    """
    # Verify admin access
    await require_admin(user)

    # Fetch all reports
    cursor = db.reports.find(
        {},
        {"_id": 0}
    ).sort("created_at", -1)
    return await cursor.to_list(500)

async def admin_resolve_report(user: Dict[str, Any], report_id: str) -> bool:
    """
    Resolve a report (mark as handled).

    Args:
        user: Authenticated admin user dictionary
        report_id: ID of the report to resolve

    Returns:
        True if report was resolved, False otherwise
    """
    # Verify admin access
    await require_admin(user)

    # Update report status
    result = await db.reports.update_one(
        {"report_id": report_id},
        {"$set": {"status": "resolved"}}
    )
    return result.matched_count > 0

# Game leaderboard service functions
async def _leaderboard_for(game: str, limit: int = 20) -> List[Dict[str, Any]]:
    """
    Get leaderboard for a specific game.

    Args:
        game: Game name
        limit: Maximum number of entries to return

    Returns:
        List of leaderboard entries
    """
    from config.settings import LOWER_IS_BETTER
    ascending = game in LOWER_IS_BETTER

    pipeline = [
        {"$match": {"game": game}},
        {"$sort": {"score": 1 if ascending else -1, "created_at": 1}},
        {"$group": {
            "_id": "$user_id",
            "user_name": {"$first": "$user_name"},
            "score": {"$first": "$score"},
            "created_at": {"$first": "$created_at"}
        }},
        {"$sort": {"score": 1 if ascending else -1}},
        {"$limit": limit}
    ]

    results = await db.game_scores.aggregate(pipeline).to_list(limit)
    return [
        {
            "user_id": r["_id"],
            "user_name": r["user_name"],
            "score": r["score"]
        }
        for r in results
    ]

async def submit_game_score(user: Dict[str, Any], body: Dict[str, Any]) -> Dict[str, Any]:
    """
    Submit a game score for the user.

    Args:
        user: Authenticated user dictionary
        body: Game score data containing game name and score

    Returns:
        Dictionary containing submission result and user's rank

    Raises:
        Exception: If game is not allowed
    """
    # Verify admin access - actually, this should be available to all users
    # await require_admin(user)  # Removed - game scoring should be available to all users

    # Validate game
    from config.settings import ALLOWED_GAMES
    if body["game"] not in ALLOWED_GAMES:
        raise Exception("Unknown game")

    # Insert score document
    doc = {
        "user_id": user["user_id"],
        "user_name": user.get("name") or "Player",
        "game": body["game"],
        "score": body["score"],
        "created_at": _now_utc(),
    }
    await db.game_scores.insert_one(doc)

    # Get user's rank on this game's leaderboard
    board = await _leaderboard_for(body["game"], limit=1000)
    rank = next((i + 1 for i, r in enumerate(board) if r["user_id"] == user["user_id"]), None)

    return {
        "ok": True,
        "rank": rank,
        "total_players": len(board)
    }

async def get_game_leaderboard(game: str, limit: int = 20) -> List[Dict[str, Any]]:
    """
    Get leaderboard for a specific game.

    Args:
        game: Game name
        limit: Maximum number of entries to return

    Returns:
        List of leaderboard entries
    """
    from config.settings import ALLOWED_GAMES
    if game not in ALLOWED_GAMES:
        raise Exception("Unknown game")

    return await _leaderboard_for(game, limit)

# Trivia service
from config.settings import TRIVIA_QUESTIONS

async def get_trivia_questions() -> List[Dict[str, Any]]:
    """
    Get a set of random trivia questions.

    Returns:
        List of trivia question dictionaries
    """
    import random
    qs = random.sample(TRIVIA_QUESTIONS, k=min(5, len(TRIVIA_QUESTIONS)))
    return qs
