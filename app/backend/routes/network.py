"""Network intelligence APIs: history, reliability, context, search and daily challenge."""

from __future__ import annotations

import hashlib
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel, Field

from config.database import db
from config.locations import search_locations
from config.trivia_bank import TRIVIA_BANK
from services.auth_service import get_current_user
from services.mobility_service import seats_summary, trip_phase

router = APIRouter(tags=["network-intelligence"])


class AnalyticsEvent(BaseModel):
    event: str = Field(min_length=2, max_length=64)
    context: Dict[str, Any] = Field(default_factory=dict)


class ChallengeAnswer(BaseModel):
    challenge_id: str
    answer: int = Field(ge=0, le=3)


async def _user(authorization: Optional[str]) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization header")
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return user


def _participants(pool: dict) -> set[str]:
    ids = {pool.get("user_id")}
    ids.update(t.get("user_id") for t in pool.get("confirmed_travelers") or [] if t.get("user_id"))
    return {x for x in ids if x}


def _public_user(user: dict) -> dict:
    return {
        "user_id": user.get("user_id"),
        "name": user.get("name") or "Traveller",
        "username": user.get("username"),
        "picture": user.get("picture"),
        "college_verified": bool(user.get("college_verified")),
        "school_name": user.get("school_name"),
        "batch_year": user.get("batch_year"),
        "branch_name": user.get("branch_name"),
        "program_name": user.get("program_name"),
    }


async def _reliability(user_id: str) -> dict:
    completed = await db.pools.find(
        {"trip_status": "completed", "$or": [{"user_id": user_id}, {"confirmed_travelers.user_id": user_id}]},
        {"_id": 0, "pool_id": 1},
    ).to_list(2000)
    owned_total = await db.pools.count_documents({"user_id": user_id})
    owned_cancelled = await db.pools.count_documents({"user_id": user_id, "trip_status": "cancelled"})
    incoming_total = await db.join_requests.count_documents({"pool_owner_id": user_id})
    responded = await db.join_requests.count_documents({"pool_owner_id": user_id, "status": {"$in": ["accepted", "declined"]}})
    rating_pipeline = [
        {"$match": {"rated_user_id": user_id}},
        {"$group": {"_id": "$rated_user_id", "avg": {"$avg": "$stars"}, "count": {"$sum": 1}}},
    ]
    rating_rows = await db.ratings.aggregate(rating_pipeline).to_list(1)
    rating = rating_rows[0] if rating_rows else None
    completion_score = min(40, len(completed) * 4)
    rating_score = 0 if not rating else min(40, round(float(rating["avg"]) / 10 * 40))
    response_score = 10 if incoming_total == 0 else round((responded / incoming_total) * 10)
    cancellation_score = 10 if owned_total == 0 else max(0, round(10 * (1 - owned_cancelled / owned_total)))
    score = max(0, min(100, completion_score + rating_score + response_score + cancellation_score))
    return {
        "score": score,
        "completed_trips": len(completed),
        "average_rating": round(float(rating["avg"]), 1) if rating else None,
        "rating_count": int(rating["count"]) if rating else 0,
        "response_rate": round((responded / incoming_total) * 100) if incoming_total else None,
        "cancellation_rate": round((owned_cancelled / owned_total) * 100) if owned_total else 0,
        "label": "Highly reliable" if score >= 85 else "Reliable" if score >= 70 else "Building history" if score >= 40 else "New traveller",
    }


@router.get("/travel-history")
async def travel_history(authorization: Optional[str] = Header(None), limit: int = Query(default=50, ge=1, le=200)):
    user = await _user(authorization)
    pools = await db.pools.find(
        {"$or": [{"user_id": user["user_id"]}, {"confirmed_travelers.user_id": user["user_id"]}], "travel_datetime": {"$lt": datetime.now(timezone.utc) + timedelta(hours=2)}},
        {"_id": 0},
    ).sort("travel_datetime", -1).limit(limit).to_list(limit)
    result = []
    for pool in pools:
        others = [
            {"user_id": t.get("user_id"), "name": t.get("name")}
            for t in pool.get("confirmed_travelers") or [] if t.get("user_id") != user["user_id"]
        ]
        if pool.get("user_id") != user["user_id"]:
            others.insert(0, {"user_id": pool.get("user_id"), "name": pool.get("user_name")})
        result.append({
            "pool_id": pool["pool_id"],
            "from_location": pool["from_location"],
            "to_location": pool["to_location"],
            "travel_datetime": pool["travel_datetime"],
            "trip_status": pool.get("trip_status") or trip_phase(pool),
            "co_travellers": others,
            "is_owner": pool.get("user_id") == user["user_id"],
            "fare": pool.get("fare"),
            "seats": seats_summary(pool),
        })
    return result


@router.get("/reliability/me")
async def my_reliability(authorization: Optional[str] = Header(None)):
    user = await _user(authorization)
    return await _reliability(user["user_id"])


@router.get("/users/{user_id}/profile")
async def public_profile(user_id: str, authorization: Optional[str] = Header(None)):
    await _user(authorization)
    user = await db.users.find_one({"user_id": user_id, "account_deleted": {"$ne": True}}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _public_user(user)


@router.get("/reliability/{user_id}")
async def user_reliability(user_id: str, authorization: Optional[str] = Header(None)):
    await _user(authorization)
    if not await db.users.find_one({"user_id": user_id}, {"_id": 1}):
        raise HTTPException(status_code=404, detail="User not found")
    return await _reliability(user_id)


@router.get("/mutual-context/{other_user_id}")
async def mutual_context(other_user_id: str, authorization: Optional[str] = Header(None)):
    me = await _user(authorization)
    if other_user_id == me["user_id"]:
        return {"shared_trips": 0, "mutual_travellers": [], "academic": []}
    other = await db.users.find_one({"user_id": other_user_id, "account_deleted": {"$ne": True}}, {"_id": 0})
    if not other:
        raise HTTPException(status_code=404, detail="User not found")

    shared = await db.pools.find(
        {"trip_status": "completed", "$and": [
            {"$or": [{"user_id": me["user_id"]}, {"confirmed_travelers.user_id": me["user_id"]}]},
            {"$or": [{"user_id": other_user_id}, {"confirmed_travelers.user_id": other_user_id}]},
        ]}, {"_id": 0}
    ).to_list(200)

    academic = []
    for key, label in (("school_name", "Same school"), ("batch_year", "Same batch"), ("branch_name", "Same programme")):
        if me.get(key) and other.get(key) and me.get(key) == other.get(key):
            academic.append(label)

    my_trips = await db.pools.find({"trip_status": "completed", "$or": [{"user_id": me["user_id"]}, {"confirmed_travelers.user_id": me["user_id"]}]}, {"_id": 0}).to_list(500)
    their_trips = await db.pools.find({"trip_status": "completed", "$or": [{"user_id": other_user_id}, {"confirmed_travelers.user_id": other_user_id}]}, {"_id": 0}).to_list(500)
    my_people = set().union(*[_participants(p) for p in my_trips]) if my_trips else set()
    their_people = set().union(*[_participants(p) for p in their_trips]) if their_trips else set()
    mutual_ids = list((my_people & their_people) - {me["user_id"], other_user_id})[:8]
    mutual_users = await db.users.find({"user_id": {"$in": mutual_ids}}, {"_id": 0, "user_id": 1, "name": 1}).to_list(8) if mutual_ids else []
    return {"shared_trips": len(shared), "mutual_travellers": mutual_users, "academic": academic, "profile": _public_user(other)}


@router.get("/search/global")
async def global_search(q: str = Query(min_length=2, max_length=80), authorization: Optional[str] = Header(None)):
    me = await _user(authorization)
    pattern = re.compile(re.escape(q.strip()), re.IGNORECASE)
    locations = search_locations(q, 6)
    now = datetime.now(timezone.utc)
    pools = await db.pools.find(
        {"status": "open", "travel_datetime": {"$gte": now - timedelta(hours=1)}, "$or": [{"from_location": pattern}, {"to_location": pattern}, {"user_name": pattern}]},
        {"_id": 0},
    ).sort("travel_datetime", 1).limit(8).to_list(8)
    users = await db.users.find(
        {"user_id": {"$ne": me["user_id"]}, "account_deleted": {"$ne": True}, "$or": [{"name": pattern}, {"username": pattern}]},
        {"_id": 0, "user_id": 1, "name": 1, "username": 1, "picture": 1, "college_verified": 1, "school_name": 1, "batch_year": 1, "branch_name": 1, "program_name": 1},
    ).limit(8).to_list(8)
    conversations = await db.conversations.find(
        {"member_ids": me["user_id"], "name": pattern}, {"_id": 0, "conversation_id": 1, "name": 1, "type": 1}
    ).limit(6).to_list(6)
    return {"locations": locations, "rides": pools, "people": [_public_user(u) for u in users], "chats": conversations}


@router.post("/analytics/events")
async def record_event(body: AnalyticsEvent, authorization: Optional[str] = Header(None)):
    user = await _user(authorization)
    safe_context = {k: v for k, v in body.context.items() if k not in {"email", "phone", "password", "token"}}
    await db.product_events.insert_one({
        "event_id": f"evt_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "event": body.event,
        "context": safe_context,
        "created_at": datetime.now(timezone.utc),
    })
    return {"ok": True}


@router.get("/analytics/product")
async def product_analytics(authorization: Optional[str] = Header(None)):
    user = await _user(authorization)
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    since = datetime.now(timezone.utc) - timedelta(days=30)
    pipeline = [
        {"$match": {"created_at": {"$gte": since}}},
        {"$group": {"_id": "$event", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    events = await db.product_events.aggregate(pipeline).to_list(100)
    return {
        "window_days": 30,
        "events": [{"event": row["_id"], "count": row["count"]} for row in events],
        "users": await db.users.count_documents({}),
        "completed_trips": await db.pools.count_documents({"trip_status": "completed", "completed_at": {"$gte": since}}),
        "new_pools": await db.pools.count_documents({"created_at": {"$gte": since}}),
        "accepted_requests": await db.join_requests.count_documents({"status": "accepted", "responded_at": {"$gte": since}}),
    }


def _daily_question(day: date) -> dict:
    digest = hashlib.sha256(day.isoformat().encode("utf-8")).hexdigest()
    return TRIVIA_BANK[int(digest[:8], 16) % len(TRIVIA_BANK)]


async def _correct_streak(user_id: str, today: date) -> int:
    recent = await db.daily_challenges.find(
        {"user_id": user_id, "correct": True}, {"_id": 0, "date": 1}
    ).sort("date", -1).limit(90).to_list(90)
    completed_dates = {row["date"] for row in recent}
    cursor = today if today.isoformat() in completed_dates else today - timedelta(days=1)
    streak = 0
    while cursor.isoformat() in completed_dates:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


@router.get("/daily-challenge")
async def daily_challenge(authorization: Optional[str] = Header(None)):
    user = await _user(authorization)
    today = datetime.now(timezone.utc).date()
    question = _daily_question(today)
    challenge_id = f"daily_{today.isoformat()}_{question['id']}"
    completion = await db.daily_challenges.find_one({"user_id": user["user_id"], "challenge_id": challenge_id}, {"_id": 0})
    return {
        "challenge_id": challenge_id,
        "date": today.isoformat(),
        "q": question["q"],
        "options": question["options"],
        "category": question.get("category"),
        "completed": bool(completion),
        "correct": completion.get("correct") if completion else None,
        "answer": question["answer"] if completion else None,
        "streak": await _correct_streak(user["user_id"], today),
    }


@router.post("/daily-challenge/answer")
async def answer_daily_challenge(body: ChallengeAnswer, authorization: Optional[str] = Header(None)):
    user = await _user(authorization)
    today = datetime.now(timezone.utc).date()
    question = _daily_question(today)
    expected_id = f"daily_{today.isoformat()}_{question['id']}"
    if body.challenge_id != expected_id:
        raise HTTPException(status_code=400, detail="This daily challenge has expired")

    existing = await db.daily_challenges.find_one(
        {"user_id": user["user_id"], "challenge_id": expected_id}, {"_id": 0}
    )
    if existing:
        return {
            "correct": bool(existing.get("correct")),
            "answer": question["answer"],
            "streak": await _correct_streak(user["user_id"], today),
            "locked": True,
        }

    correct = body.answer == int(question["answer"])
    now = datetime.now(timezone.utc)
    await db.daily_challenges.insert_one({
        "user_id": user["user_id"],
        "challenge_id": expected_id,
        "date": today.isoformat(),
        "selected_answer": body.answer,
        "correct": correct,
        "answered_at": now,
    })
    streak = await _correct_streak(user["user_id"], today) if correct else 0
    return {"correct": correct, "answer": question["answer"], "streak": streak, "locked": True}


__all__ = ["router"]