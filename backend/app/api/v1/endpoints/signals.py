from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Any
from app.db.mongodb import get_database
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.models.signal import Signal

router = APIRouter()

@router.get("/latest", response_model=List[Signal])
async def get_latest_signals(
    limit: int = Query(20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_database)
) -> Any:
    cursor = db.signals.find({}).sort("created_at", -1).limit(limit)
    signals = await cursor.to_list(length=limit)
    return signals

@router.get("/{symbol}", response_model=List[Signal])
async def get_signals_by_symbol(
    symbol: str,
    limit: int = Query(20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_database)
) -> Any:
    cursor = db.signals.find({"symbol": symbol}).sort("created_at", -1).limit(limit)
    signals = await cursor.to_list(length=limit)
    return signals
