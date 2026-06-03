from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class OHLCV(BaseModel):
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float

class IndicatorData(BaseModel):
    rsi: Optional[float] = None
    macd: Optional[float] = None
    macd_signal: Optional[float] = None
    macd_hist: Optional[float] = None
    ema_20: Optional[float] = None
    ema_50: Optional[float] = None
    ema_200: Optional[float] = None
    vwap: Optional[float] = None
    atr: Optional[float] = None
    bb_upper: Optional[float] = None
    bb_middle: Optional[float] = None
    bb_lower: Optional[float] = None

class PatternData(BaseModel):
    is_doji: bool = False
    is_hammer: bool = False
    is_engulfing: bool = False
    # we can expand this with more patterns

class EnhancedMarketData(OHLCV):
    indicators: Optional[IndicatorData] = None
    patterns: Optional[PatternData] = None

class MarketDataResponse(BaseModel):
    symbol: str
    interval: str
    data: List[EnhancedMarketData]
