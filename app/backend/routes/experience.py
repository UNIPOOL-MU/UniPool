"""User-facing experience APIs for UniPool v2.1.

Notification inbox/preferences, saved pickup points, cancellation/no-show records,
privacy-safe client error telemetry, and admin release diagnostics live here so
those concerns do not leak into mobility screens or ad-hoc collections.
"""

from __future__ import annotations

import os
import re
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel, Field

from config.database import db
from services.auth_service import get_current_user

router = APIRouter(tags=["experience-v2"])

DEFAULT_NOTIFICATION_PREFERENCES = {
    "push_enabled": True,
    "email_enabled": True,
    "categories": {
        "match": True,
        "request": True,
        "trip": True,
        "chat": True,
        "saved_route": True,
        "rating": True,
        "digest": False,
        "games": False,
        "general": True,
    },
}


class NotificationPreferencesPatch(BaseModel):
    push_enabled: Optional[bool] = None
    email_enabled: Optional[bool] = None
    categories: Optional[Dict[str, bool]] = None


class PickupPointInput(BaseModel):
    label: str = Field(min_length=2, max_length=80)
    address: Optional[str] = Field(default=None, max_length=180)
    notes: Optional[str] = Field(default=None, max_length=180)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class CancellationInput(BaseModel):
    reason: str = Field(min_length=2, max_length=64)
    note: Optional[str] = Field(default=None, max_length=240)


class NoShowInput(BaseModel):
    reported_user_id: str = Field(min_length=3, max_length=80)
    note: Optional[str] = Field(default=None, max_length=240)


class ClientErrorInput(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    message: str = Field(min_length=1, max_length=500)
    route: Optional[str] = Field(default=None, max_length=160)
    endpoint: Optional[str] = Field(default=None, max_length=180)
    status: Optional[int] = Field(default=None, ge=0, le=599)
    app_version: Optional[str] = Field(default=None, max_length=64)
    context: Dict[str, Any] = Field(default_factory=dict)


async def _user(authorization: Optional[str]) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization header")
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return user


def _prefs(doc: Optional[dict]) -> dict:
    base = {
        "push_enabled": DEFAULT_NOTIFICATION_PREFERENCES["push_enabled"],
        "email_enabled": DEFAULT_NOTIFICATION_PREFERENCES["email_enabled"],
        "categories": dict(DEFAULT_NOTIFICATION_PREFERENCES["categories"]),
    }
    if not doc:
        return base
    if isinstance(doc.get("push_enabled"), bool):
        base["push_enabled"] = doc["push_enabled"]
    if isinstance(doc.get("email_enabled"), bool):
        base["email_enabled"] = doc["email_enabled"]
    if isinstance(doc.get("categories"), dict):
        for key, value in doc["categories"].items():
            if key in base["categories"] and isinstance(value, bool):
                base["categories"][key] = value
    return base


def _participants(pool: dict) -> set[str]:
    ids = {pool.get("user_id")}
    ids.update(t.get("user_id") for t in pool.get("confirmed_travelers") or [] if t.get("user_id"))
    return {x for x in ids if x}


@router.get("/notifications")
async def notifications(
    authorization: Optional[str] = Header(None),
    limit: int = Query(default=60, ge=1, le=150),
    unread_only: bool = Query(default=False),
):
    user = await _user(authorization)
    query: Dict[str, Any] = {"user_id": user["user_id"]}
    if unread_only:
        query["read_at"] = None
    items = await db.notifications.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    unread = await db.notifications.count_documents({"user_id": user["user_id"], "read_at": None})
    return {"items": items, "unread": unread}


@router.patch("/notifications/{notification_id}/read")
async def read_notification(notification_id: str, authorization: Optional[str] = Header(None)):
    user = await _user(authorization)
    result = await db.notifications.update_one(
        {"notification_id": notification_id, "user_id": user["user_id"]},
        {"$set": {"read_at": datetime.now(timezone.utc)}},
    )
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"ok": True}


@router.post("/notifications/read-all")
async def read_all_notifications(authorization: Optional[str] = Header(None)):
    user = await _user(authorization)
    await db.notifications.update_many(
        {"user_id": user["user_id"], "read_at": None},
        {"$set": {"read_at": datetime.now(timezone.utc)}},
    )
    return {"ok": True}


@router.get("/notification-preferences")
async def get_notification_preferences(authorization: Optional[str] = Header(None)):
    user = await _user(authorization)
    doc = await db.notification_preferences.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return _prefs(doc)


@router.patch("/notification-preferences")
async def patch_notification_preferences(body: NotificationPreferencesPatch, authorization: Optional[str] = Header(None)):
    user = await _user(authorization)
    current = _prefs(await db.notification_preferences.find_one({"user_id": user["user_id"]}, {"_id": 0}))
    patch = body.model_dump(exclude_none=True)
    if "push_enabled" in patch:
        current["push_enabled"] = patch["push_enabled"]
    if "email_enabled" in patch:
        current["email_enabled"] = patch["email_enabled"]
    for key, value in (patch.get("categories") or {}).items():
        if key in current["categories"]:
            current["categories"][key] = bool(value)
    current["user_id"] = user["user_id"]
    current["updated_at"] = datetime.now(timezone.utc)
    await db.notification_preferences.update_one({"user_id": user["user_id"]}, {"$set": current}, upsert=True)
    return _prefs(current)


@router.get("/pickup-points")
async def pickup_points(authorization: Optional[str] = Header(None)):
    user = await _user(authorization)
    return await db.pickup_points.find({"user_id": user["user_id"]}, {"_id": 0}).sort("updated_at", -1).to_list(50)


@router.post("/pickup-points")
async def save_pickup_point(body: PickupPointInput, authorization: Optional[str] = Header(None)):
    user = await _user(authorization)
    now = datetime.now(timezone.utc)
    normalized = re.sub(r"\s+", " ", body.label.strip()).casefold()
    existing = await db.pickup_points.find_one({"user_id": user["user_id"], "normalized_label": normalized}, {"_id": 0})
    point = {
        "pickup_point_id": existing.get("pickup_point_id") if existing else f"pickup_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "normalized_label": normalized,
        "label": body.label.strip(),
        "address": body.address.strip() if body.address else None,
        "notes": body.notes.strip() if body.notes else None,
        "lat": body.lat,
        "lng": body.lng,
        "created_at": existing.get("created_at", now) if existing else now,
        "updated_at": now,
    }
    await db.pickup_points.update_one({"user_id": user["user_id"], "normalized_label": normalized}, {"$set": point}, upsert=True)
    return {k: v for k, v in point.items() if k not in {"user_id", "normalized_label"}}


@router.delete("/pickup-points/{pickup_point_id}")
async def delete_pickup_point(pickup_point_id: str, authorization: Optional[str] = Header(None)):
    user = await _user(authorization)
    result = await db.pickup_points.delete_one({"pickup_point_id": pickup_point_id, "user_id": user["user_id"]})
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Pickup point not found")
    return {"ok": True}


@router.post("/journeys/{pool_id}/cancel-with-reason")
async def cancel_with_reason(pool_id: str, body: CancellationInput, authorization: Optional[str] = Header(None)):
    user = await _user(authorization)
    pool = await db.pools.find_one({"pool_id": pool_id}, {"_id": 0})
    if not pool:
        raise HTTPException(status_code=404, detail="Journey not found")
    if pool.get("user_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="Only the trip owner can cancel the whole journey")
    if pool.get("trip_status") in {"completed", "cancelled"}:
        raise HTTPException(status_code=400, detail="Journey is already closed")
    now = datetime.now(timezone.utc)
    departure = pool.get("travel_datetime")
    late = bool(departure and (departure if departure.tzinfo else departure.replace(tzinfo=timezone.utc)) - now <= timedelta(hours=2))
    cancellation = {"reason": body.reason.strip(), "note": body.note.strip() if body.note else None, "late": late, "by_user_id": user["user_id"], "at": now}
    await db.pools.update_one(
        {"pool_id": pool_id},
        {"$set": {"trip_status": "cancelled", "status": "closed", "cancelled_at": now, "cancellation": cancellation, "updated_at": now}},
    )
    try:
        from services.mobility_service import notify_trip_members
        pool.update({"trip_status": "cancelled", "status": "closed", "cancellation": cancellation})
        await notify_trip_members(pool, "Trip cancelled", f"{pool['from_location']} → {pool['to_location']} · {body.reason.strip()}", exclude=[user["user_id"]])
    except Exception:
        pass
    return {"ok": True, "late": late, "cancellation": cancellation}


@router.post("/journeys/{pool_id}/no-show")
async def report_no_show(pool_id: str, body: NoShowInput, authorization: Optional[str] = Header(None)):
    user = await _user(authorization)
    pool = await db.pools.find_one({"pool_id": pool_id}, {"_id": 0})
    if not pool:
        raise HTTPException(status_code=404, detail="Journey not found")
    people = _participants(pool)
    if user["user_id"] not in people or body.reported_user_id not in people or body.reported_user_id == user["user_id"]:
        raise HTTPException(status_code=403, detail="No-show reports are only for people on the same trip")
    departure = pool.get("travel_datetime")
    if departure:
        departure = departure if departure.tzinfo else departure.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) < departure + timedelta(minutes=30):
            raise HTTPException(status_code=400, detail="No-show reporting unlocks 30 minutes after departure")
    existing = await db.reports.find_one({"pool_id": pool_id, "reporter_id": user["user_id"], "reported_user_id": body.reported_user_id, "reason": "no-show"})
    if existing:
        raise HTTPException(status_code=409, detail="You already reported this no-show")
    report = {
        "report_id": f"report_{uuid.uuid4().hex[:12]}", "pool_id": pool_id, "reporter_id": user["user_id"],
        "reported_user_id": body.reported_user_id, "reason": "no-show", "details": body.note.strip() if body.note else None,
        "created_at": datetime.now(timezone.utc), "status": "open",
    }
    await db.reports.insert_one(report)
    report.pop("_id", None)
    return report


@router.post("/client-errors")
async def record_client_error(body: ClientErrorInput, authorization: Optional[str] = Header(None)):
    user = await _user(authorization)
    safe_context = {k: v for k, v in body.context.items() if k.lower() not in {"email", "phone", "password", "token", "authorization", "message_text"}}
    doc = {
        "error_id": f"err_{uuid.uuid4().hex[:12]}", "user_id": user["user_id"], "name": body.name,
        "message": body.message, "route": body.route, "endpoint": body.endpoint, "status": body.status,
        "app_version": body.app_version, "context": safe_context, "created_at": datetime.now(timezone.utc),
    }
    await db.client_errors.insert_one(doc)
    return {"ok": True, "error_id": doc["error_id"]}


@router.get("/daily-challenge/leaderboard")
async def daily_challenge_leaderboard(authorization: Optional[str] = Header(None)):
    await _user(authorization)
    pipeline = [
        {"$match": {"correct": True}},
        {"$group": {"_id": "$user_id", "correct_days": {"$sum": 1}, "latest": {"$max": "$answered_at"}}},
        {"$sort": {"correct_days": -1, "latest": 1}},
        {"$limit": 20},
    ]
    rows = await db.daily_challenges.aggregate(pipeline).to_list(20)
    ids = [row["_id"] for row in rows]
    users = await db.users.find({"user_id": {"$in": ids}}, {"_id": 0, "user_id": 1, "name": 1}).to_list(20) if ids else []
    names = {u["user_id"]: u.get("name") or "Traveller" for u in users}
    return [{"user_id": row["_id"], "name": names.get(row["_id"], "Traveller"), "correct_days": row["correct_days"]} for row in rows]


@router.get("/admin/release-diagnostics")
async def release_diagnostics(frontend_version: Optional[str] = Query(default=None, max_length=64), authorization: Optional[str] = Header(None)):
    user = await _user(authorization)
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    started = time.perf_counter()
    database = "ok"
    try:
        await db.command("ping")
    except Exception:
        database = "degraded"
    latency = round((time.perf_counter() - started) * 1000, 1)
    recent_errors = await db.client_errors.find({}, {"_id": 0, "name": 1, "route": 1, "endpoint": 1, "status": 1, "app_version": 1, "created_at": 1}).sort("created_at", -1).limit(20).to_list(20)
    return {
        "status": "ok" if database == "ok" else "degraded",
        "backend_version": "2.2.0",
        "backend_commit": os.environ.get("RENDER_GIT_COMMIT") or os.environ.get("GIT_COMMIT") or None,
        "frontend_version": frontend_version,
        "database_latency_ms": latency,
        "open_pools": await db.pools.count_documents({"status": "open"}),
        "unread_notifications": await db.notifications.count_documents({"read_at": None}),
        "failed_client_events": recent_errors,
        "generated_at": datetime.now(timezone.utc),
    }


__all__ = ["router", "DEFAULT_NOTIFICATION_PREFERENCES"]
