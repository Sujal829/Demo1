from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime
from enum import Enum

class Role(str, Enum):
    USER = "user"
    PREMIUM = "premium"
    ADMIN = "admin"

class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: Role = Role.USER

class UserCreate(UserBase):
    password: str

class UserInDB(UserBase):
    id: str = Field(alias="_id")
    hashed_password: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = True

class UserResponse(UserBase):
    id: str = Field(alias="_id")
    created_at: datetime
    is_active: bool

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None
