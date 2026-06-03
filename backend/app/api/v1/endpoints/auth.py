from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from typing import Any
from app.models.user import UserCreate, UserResponse, Token, UserInDB
from app.core.security import get_password_hash, verify_password, create_access_token
from app.db.mongodb import get_database
from motor.motor_asyncio import AsyncIOMotorDatabase
import uuid

router = APIRouter()

@router.post("/register", response_model=UserResponse)
async def register(
    user_in: UserCreate,
    db: AsyncIOMotorDatabase = Depends(get_database)
) -> Any:
    # Check if user exists
    user_exists = await db.users.find_one({"email": user_in.email})
    if user_exists:
        raise HTTPException(
            status_code=400,
            detail="The user with this email already exists in the system.",
        )
    
    user_dict = user_in.model_dump()
    user_dict["hashed_password"] = get_password_hash(user_dict.pop("password"))
    user_dict["_id"] = str(uuid.uuid4())
    
    new_user = UserInDB(**user_dict)
    
    await db.users.insert_one(new_user.model_dump(by_alias=True))
    
    return new_user

@router.post("/login", response_model=Token)
async def login(
    db: AsyncIOMotorDatabase = Depends(get_database),
    form_data: OAuth2PasswordRequestForm = Depends()
) -> Any:
    user = await db.users.find_one({"email": form_data.username})
    if not user:
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    
    if not verify_password(form_data.password, user["hashed_password"]):
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    
    if not user.get("is_active", True):
        raise HTTPException(status_code=400, detail="Inactive user")
    
    access_token = create_access_token(subject=user["email"])
    return {
        "access_token": access_token,
        "token_type": "bearer"
    }
