"""Canonical FastAPI entry point for the UniPool backend."""

import asyncio
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

backend_dir = Path(__file__).parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from config.database import db
from routes import (
    admin_router,
    auth_router,
    compat_router,
    experience_router,
    expenses_router,
    games_router,
    matches_router,
    messages_router,
    mobility_router,
    network_router,
    personal_finance_router,
    pools_router,
    profile_router,
    requests_router,
    users_router,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("unipool")

API_VERSION = "2.3.2"

app = FastAPI(
    title="UniPool API",
    description="Backend API for UniPool - University Carpooling Platform",
    version=API_VERSION,
)

# Browser access is limited to UniPool's production hosts and local development.
# Bearer-token API clients such as native builds are not affected by CORS.
app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=[
        "https://uni-pool-five.vercel.app",
        "https://uni-pool-ruddy.vercel.app",
        "https://uni-pool-um26s-projects-7a7e368d.vercel.app",
        "https://uni-pool-git-main-um26s-projects-7a7e368d.vercel.app",
        "http://localhost:3000",
        "http://localhost:8081",
        "http://localhost:19006",
    ],
    allow_origin_regex=r"https://uni-pool-[a-z0-9-]+-(um26s-projects-7a7e368d|animesh11)\.vercel\.app",
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

for router in (
    auth_router,
    pools_router,
    profile_router,
    requests_router,
    messages_router,
    admin_router,
    games_router,
    matches_router,
    users_router,
    mobility_router,
    network_router,
    expenses_router,
    personal_finance_router,
    experience_router,
    compat_router,
):
    app.include_router(router, prefix="/api")


@app.get("/")
async def root():
    return {"app": "UniPool", "status": "ok", "version": API_VERSION, "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/health")
async def health():
    database = "ok"
    try:
        await db.command("ping")
    except Exception:
        database = "degraded"
    return {
        "app": "UniPool", "status": "ok" if database == "ok" else "degraded", "database": database,
        "version": API_VERSION, "mobility_version": "2.2", "circles_version": "1.1", "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def _explicit_seed_admin(email: str, username: str, password: str) -> bool:
    if not (email and username and password):
        return False
    return (email, username, password) != ("admin@unipool.app", "admin", "securepassword123")


async def _mobility_maintenance_loop():
    """Run idempotent trip maintenance while the backend is awake."""
    from services.mobility_service import materialize_due_recurring_routes, send_departure_reminders
    recurring_tick = 0
    while True:
        try:
            await send_departure_reminders()
            if recurring_tick % 6 == 0:
                await materialize_due_recurring_routes()
        except Exception as exc:
            logger.warning("Mobility maintenance failed: %s", exc)
        recurring_tick += 1
        await asyncio.sleep(600)


@app.on_event("startup")
async def startup_event():
    logger.info("Starting UniPool application...")
    try:
        # Sparse unique indexes still index an explicitly stored null value.
        # Older auth paths wrote username=None, so after the first such user
        # every later password/OAuth signup could fail with E11000 username_1.
        # Remove null/blank optional usernames before enforcing the index.
        await db.users.update_many({"username": {"$type": "null"}}, {"$unset": {"username": ""}})
        await db.users.update_many({"username": ""}, {"$unset": {"username": ""}})

        await db.users.create_index("email", unique=True)
        await db.users.create_index("user_id", unique=True)
        await db.users.create_index("username", unique=True, sparse=True)
        await db.users.create_index("roll_number", sparse=True)
        await db.user_sessions.create_index("session_token", unique=True)
        await db.user_sessions.create_index("user_id")
        await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
        await db.auth_login_attempts.create_index("key", unique=True)
        await db.auth_login_attempts.create_index("expires_at", expireAfterSeconds=0)
        await db.pools.create_index("pool_id", unique=True)
        await db.pools.create_index([("from_location", 1), ("to_location", 1), ("travel_datetime", 1)])
        await db.pools.create_index([("route_key", 1), ("status", 1), ("travel_datetime", 1)])
        await db.pools.create_index([("user_id", 1), ("status", 1), ("travel_datetime", 1)])
        await db.join_requests.create_index("request_id", unique=True)
        await db.join_requests.create_index([("pool_owner_id", 1), ("status", 1)])
        await db.join_requests.create_index([("requester_id", 1), ("status", 1)])
        await db.blocks.create_index([("blocker_id", 1), ("blocked_id", 1)], unique=True)
        await db.reports.create_index("created_at")
        await db.reports.create_index([("pool_id", 1), ("reporter_id", 1), ("reported_user_id", 1), ("reason", 1)])
        await db.college_verifications.create_index("user_id", unique=True)
        await db.messages.create_index("message_id", unique=True)
        await db.messages.create_index([("from_user_id", 1), ("created_at", 1)])
        await db.messages.create_index([("conversation_id", 1), ("created_at", 1)])
        await db.messages.create_index([("to_user_id", 1), ("read", 1), ("created_at", -1)])
        await db.conversations.create_index("conversation_id", unique=True)
        await db.conversations.create_index([("type", 1), ("route_key", 1), ("travel_datetime", 1)])
        await db.push_subscriptions.create_index("endpoint", unique=True)
        await db.push_subscriptions.create_index("user_id")
        await db.game_scores.create_index([("game", 1)])
        await db.saved_routes.create_index([("user_id", 1), ("route_key", 1)], unique=True)
        await db.saved_routes.create_index([("route_key", 1), ("alerts_enabled", 1)])
        await db.recurring_routes.create_index("template_id", unique=True)
        await db.recurring_routes.create_index([("user_id", 1), ("active", 1)])
        await db.product_events.create_index([("event", 1), ("created_at", -1)])
        await db.product_events.create_index([("user_id", 1), ("created_at", -1)])
        await db.daily_challenges.create_index([("user_id", 1), ("challenge_id", 1)], unique=True)
        await db.notifications.create_index("notification_id", unique=True)
        await db.notifications.create_index([("user_id", 1), ("read_at", 1), ("created_at", -1)])
        await db.notification_preferences.create_index("user_id", unique=True)
        await db.pickup_points.create_index("pickup_point_id", unique=True)
        await db.pickup_points.create_index([("user_id", 1), ("normalized_label", 1)], unique=True)
        await db.client_errors.create_index([("created_at", -1)])
        await db.client_errors.create_index([("app_version", 1), ("status", 1)])
        await db.expense_groups.create_index("group_id", unique=True)
        await db.expense_groups.create_index("invite_code", unique=True)
        await db.expense_groups.create_index([("member_ids", 1), ("updated_at", -1)])
        await db.expenses.create_index("expense_id", unique=True)
        await db.expenses.create_index([("group_id", 1), ("created_at", -1)])
        await db.expense_settlements.create_index("settlement_id", unique=True)
        await db.expense_settlements.create_index([("group_id", 1), ("created_at", -1)])
        await db.expense_activity.create_index([("group_id", 1), ("created_at", -1)])
        await db.personal_transactions.create_index("transaction_id", unique=True)
        await db.personal_transactions.create_index([("user_id", 1), ("occurred_at", -1)])
        await db.personal_transactions.create_index([("user_id", 1), ("kind", 1), ("occurred_at", -1)])

        from config.settings import SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_USERNAME
        from helpers.auth_helper import _hash_password
        if _explicit_seed_admin(SEED_ADMIN_EMAIL, SEED_ADMIN_USERNAME, SEED_ADMIN_PASSWORD):
            existing_admin = await db.users.find_one(
                {"$or": [{"username": SEED_ADMIN_USERNAME}, {"email": SEED_ADMIN_EMAIL.lower()}]}, {"_id": 0}
            )
            if not existing_admin:
                admin_user_id = f"user_{__import__('uuid').uuid4().hex[:12]}"
                await db.users.insert_one({
                    "user_id": admin_user_id, "email": SEED_ADMIN_EMAIL.lower(), "username": SEED_ADMIN_USERNAME,
                    "name": "UniPool Admin", "picture": None, "password_hash": _hash_password(SEED_ADMIN_PASSWORD),
                    "gender": None, "phone": None, "is_admin_override": True, "created_at": datetime.now(timezone.utc), "last_login": None,
                })
        else:
            logger.warning("Admin seed skipped: configure explicit credentials instead of the historical demo defaults.")

        from services.mobility_service import backfill_canonical_pools
        backfilled = await backfill_canonical_pools()
        if backfilled:
            logger.info("Backfilled canonical mobility data for %s pools", backfilled)
        asyncio.create_task(_mobility_maintenance_loop())
        logger.info("UniPool database indexes ready")
    except Exception as exc:
        logger.exception("UniPool startup initialization failed: %s", exc)


@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Shutting down UniPool application...")


__all__ = ["app"]
