from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional

class Signal(BaseModel):
    id: str = Field(default=None, alias="_id")
    symbol: str
    signal: str  # "CALL", "PUT", "NO TRADE"
    confidence: float
    entry: Optional[float] = None
    target: Optional[float] = None
    stop_loss: Optional[float] = None
    timeframe: str = "15m"
    created_at: datetime = Field(default_factory=datetime.utcnow)
