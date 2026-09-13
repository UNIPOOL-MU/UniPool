import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from routes import compat


def call_remove(uid, target, *, modified=1):
    pool = {
        "pool_id": "qa-pool", "user_id": "owner", "trip_conversation_id": "qa-chat",
        "confirmed_travelers": [{"user_id": "traveler"}],
    }
    db = SimpleNamespace(
        pools=SimpleNamespace(find_one=AsyncMock(return_value=pool), update_one=AsyncMock(return_value=SimpleNamespace(modified_count=modified))),
        join_requests=SimpleNamespace(update_many=AsyncMock()),
        conversations=SimpleNamespace(update_one=AsyncMock()),
    )
    promote = AsyncMock()
    with patch.object(compat, "_user", AsyncMock(return_value={"user_id": uid})), patch.object(compat, "db", db), patch("services.request_service.promote_waitlist", promote):
        result = asyncio.run(compat.remove_confirmed_traveler("qa-pool", target, "Bearer test-only"))
    return result, db, promote


@pytest.mark.parametrize("uid", ["traveler", "owner"])
def test_self_leave_and_owner_remove_clear_membership_requests_and_chat(uid):
    _, db, promote = call_remove(uid, "traveler")
    assert db.pools.update_one.call_args.args[1]["$pull"] == {"confirmed_travelers": {"user_id": "traveler"}}
    assert db.join_requests.update_many.call_args.args[0] == {"pool_id": "qa-pool", "requester_id": "traveler", "status": "accepted"}
    assert db.conversations.update_one.call_args.args[1]["$pull"] == {"member_ids": "traveler"}
    promote.assert_awaited_once_with("qa-pool")


@pytest.mark.parametrize("uid,target,status", [("outsider", "traveler", 403), ("traveler", "owner", 403), ("owner", "owner", 400)])
def test_remove_protects_other_travelers_and_owner(uid, target, status):
    with pytest.raises(HTTPException) as error:
        call_remove(uid, target)
    assert error.value.status_code == status


def test_missing_traveler_returns_error_instead_of_false_success():
    with pytest.raises(HTTPException) as error:
        call_remove("owner", "missing", modified=0)
    assert error.value.status_code == 404
