"""
User-related Pydantic models and MongoDB document schemas.
"""

import re
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator


class UserOut(BaseModel):
    """Public user information (safe to expose)."""
    user_id: str
    email: EmailStr
    name: str
    picture: Optional[str] = None


class UserProfileUpdate(BaseModel):
    """Fields that can be updated in a user profile."""
    gender: Optional[str] = None
    picture: Optional[str] = Field(default=None, max_length=2_000_000)
    phone: Optional[str] = None
    blood_group: Optional[str] = None

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: Optional[str]):
        if value is None:
            return value
        phone = value.strip()
        if not re.fullmatch(r"\d{10}", phone):
            raise ValueError("Phone number must contain exactly 10 digits")
        return phone

    @field_validator("blood_group")
    @classmethod
    def validate_blood_group(cls, value: Optional[str]):
        if value is None:
            return value
        blood_group = value.strip().upper()
        allowed = {"A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"}
        if blood_group not in allowed:
            raise ValueError("Blood group must be one of A+, A-, B+, B-, AB+, AB-, O+ or O-")
        return blood_group


class SignupRequest(BaseModel):
    """User signup request."""
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=80)
    username: Optional[str] = Field(default=None, max_length=40)
    turnstile_token: Optional[str] = Field(default=None, max_length=4096)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str):
        name = re.sub(r"\s+", " ", value.strip())
        if not name:
            raise ValueError("Name is required")
        return name

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: Optional[str]):
        if value is None:
            return value
        username = value.strip()
        if not username:
            return None
        if not re.fullmatch(r"[A-Za-z0-9._-]{3,40}", username):
            raise ValueError("Username must be 3-40 characters using letters, numbers, dot, underscore or hyphen")
        return username


class EmailSignupConfirm(BaseModel):
    """Finish a regular email signup after proving mailbox ownership."""
    challenge_id: str = Field(min_length=1, max_length=128)
    code: str

    @field_validator("code")
    @classmethod
    def validate_code(cls, value: str):
        code = value.strip()
        if not re.fullmatch(r"\d{6}", code):
            raise ValueError("Verification code must contain exactly 6 digits")
        return code


class PasswordSetRequest(BaseModel):
    """Set or change the password for an authenticated account."""
    new_password: str = Field(min_length=8, max_length=128)
    current_password: Optional[str] = Field(default=None, max_length=128)


class CollegeSignupStart(SignupRequest):
    """Start a verified signup using an official Mahindra University email."""


class CollegeSignupConfirm(BaseModel):
    """Finish a verified college-email signup after proving mailbox ownership."""
    challenge_id: str = Field(min_length=1, max_length=128)
    code: str

    @field_validator("code")
    @classmethod
    def validate_code(cls, value: str):
        code = value.strip()
        if not re.fullmatch(r"\d{6}", code):
            raise ValueError("Verification code must contain exactly 6 digits")
        return code


class LoginRequest(BaseModel):
    """User login request."""
    identifier: str = Field(min_length=1, max_length=254)
    password: str = Field(min_length=1, max_length=128)
    turnstile_token: Optional[str] = Field(default=None, max_length=4096)


class CollegeVerifyStart(BaseModel):
    """Request to start college verification."""
    college_email: EmailStr


class CollegeVerifyConfirm(BaseModel):
    """Request to confirm college verification with code."""
    code: str


class UserDocument:
    """MongoDB document structure for users collection."""

    @staticmethod
    def get_indexes():
        return [
            {"key": [("email", 1)], "unique": True},
            {"key": [("user_id", 1)], "unique": True},
            {"key": [("username", 1)], "unique": True, "sparse": True},
            {"key": [("roll_number", 1)], "sparse": True},
        ]


class UserResponse(BaseModel):
    """Complete user response with computed fields."""
    user_id: str
    email: EmailStr
    name: str
    picture: Optional[str] = None
    gender: Optional[str] = None
    phone: Optional[str] = None
    blood_group: Optional[str] = None
    is_admin: bool = False
    college_verified: bool = False
    roll_number: Optional[str] = None
    school_name: Optional[str] = None
    degree_level_name: Optional[str] = None
    branch_name: Optional[str] = None
    batch_year: Optional[int] = None
    rating_avg: Optional[float] = None
    rating_count: int = 0
    rides_completed: int = 0
    badges: List[dict] = []
    created_at: datetime
    last_login: Optional[datetime] = None
    last_seen: Optional[datetime] = None
