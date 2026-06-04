from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Any
from app.db.mongodb import get_database
from app.models.signal import Signal
from app.websockets.manager import broadcast_signal

router = APIRouter()

@router.get("/latest", response_model=List[Signal])
async def get_latest_signals(
    limit: int = Query(20, ge=1, le=100),
    symbol: str = Query(None, description="Filter by symbol"),
    timeframe: str = Query(None, description="Filter by timeframe (15m, 30m, 1h, 1d)"),
    db: Any = Depends(get_database)
) -> Any:
    query = {}
    if symbol:
        query["symbol"] = symbol
    if timeframe:
        query["timeframe"] = timeframe
    cursor = db.signals.find(query).sort("created_at", -1).limit(limit)
    return list(cursor)

@router.get("/{symbol}", response_model=List[Signal])
async def get_signals_by_symbol(
    symbol: str,
    limit: int = Query(20, ge=1, le=100),
    db: Any = Depends(get_database)
) -> Any:
    cursor = db.signals.find({"symbol": symbol}).sort("created_at", -1).limit(limit)
    return list(cursor)

@router.post("/broadcast")
async def broadcast_new_signal(signal: Signal):
    try:
        await broadcast_signal(signal.model_dump(mode="json", by_alias=True))
        return {"status": "success", "message": "Signal broadcasted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
