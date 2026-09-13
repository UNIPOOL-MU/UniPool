import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from routes import network


def test_profile_returns_only_basic_public_fields():
    user = {"user_id": "other", "name": "Student", "username": "student", "college_verified": True, "branch_name": "Math", "batch_year": 2026, "email": "private@example.test", "phone": "private", "password_hash": "secret", "college_roll_number": "private"}
    with patch.object(network, "_user", AsyncMock(return_value={"user_id": "me"})), patch.object(network, "db", SimpleNamespace(users=SimpleNamespace(find_one=AsyncMock(return_value=user)))):
        result = asyncio.run(network.public_profile("other", "Bearer test"))
    assert result["name"] == "Student"
    assert result["branch_name"] == "Math"
    assert result["college_verified"] is True
    assert set(result) == {"user_id", "name", "username", "picture", "college_verified", "school_name", "batch_year", "branch_name", "program_name"}


def test_profile_requires_authentication():
    with pytest.raises(HTTPException) as error:
        asyncio.run(network.public_profile("other", None))
    assert error.value.status_code == 401


def test_profile_missing_user():
    with patch.object(network, "_user", AsyncMock(return_value={"user_id": "me"})), patch.object(network, "db", SimpleNamespace(users=SimpleNamespace(find_one=AsyncMock(return_value=None)))):
        with pytest.raises(HTTPException) as error:
            asyncio.run(network.public_profile("missing", "Bearer test"))
    assert error.value.status_code == 404
