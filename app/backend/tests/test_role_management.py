"""Role assignment must be owner-only and cannot change the owner account."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from helpers.auth_helper import _with_admin_flag
from routes import admin as admin_routes


def test_effective_roles():
    regular = {"email": "member@example.com"}
    assert _with_admin_flag(regular)["role"] == "user"
    assert _with_admin_flag({**regular, "role": "moderator"})["is_moderator"] is True
    promoted = _with_admin_flag({**regular, "role": "admin", "is_admin_override": True})
    assert promoted["is_admin"] is True
    assert promoted["role"] == "admin"
    assert _with_admin_flag({"email": "utkarsh7023340530@gmail.com"})["role"] == "owner"


def test_role_change_accepts_only_known_roles():
    with pytest.raises(ValidationError):
        admin_routes.RoleChange(role="owner")


@pytest.mark.asyncio
async def test_non_owner_cannot_change_roles(monkeypatch):
    monkeypatch.setattr(
        admin_routes, "get_current_user",
        AsyncMock(return_value={"user_id": "user_123", "email": "member@example.com"}),
    )
    fake_users = SimpleNamespace(update_one=AsyncMock(), find_one=AsyncMock())
    monkeypatch.setattr(admin_routes, "db", SimpleNamespace(users=fake_users))
    with pytest.raises(HTTPException) as exc:
        await admin_routes.set_person_role(
            "user_456", admin_routes.RoleChange(role="admin"), authorization="Bearer example"
        )
    assert exc.value.status_code == 403
    fake_users.update_one.assert_not_awaited()


@pytest.mark.asyncio
async def test_owner_cannot_demote_self(monkeypatch):
    monkeypatch.setattr(
        admin_routes, "get_current_user",
        AsyncMock(return_value={"user_id": "user_owner", "email": "utkarsh7023340530@gmail.com"}),
    )
    fake_users = SimpleNamespace(
        update_one=AsyncMock(),
        find_one=AsyncMock(return_value={"user_id": "user_owner", "email": "utkarsh7023340530@gmail.com"}),
    )
    monkeypatch.setattr(admin_routes, "db", SimpleNamespace(users=fake_users))
    with pytest.raises(HTTPException) as exc:
        await admin_routes.set_person_role(
            "user_owner", admin_routes.RoleChange(role="user"), authorization="Bearer example"
        )
    assert exc.value.status_code == 403
    fake_users.update_one.assert_not_awaited()
