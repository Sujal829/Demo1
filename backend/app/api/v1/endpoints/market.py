from fastapi import APIRouter, HTTPException, Query
from app.models.market import MarketDataResponse, EnhancedMarketData, IndicatorData, PatternData
from app.services.market_data_provider import market_data_provider
from app.services.technical_indicators import technical_indicators
from app.services.pattern_recognition import pattern_recognition
import math
import numpy as np

router = APIRouter()

def clean_nan(val):
    if val is None or math.isnan(val) or np.isnan(val):
        return None
    return float(val)

@router.get("/history", response_model=MarketDataResponse)
async def get_market_history(
    symbol: str = Query(..., description="Trading symbol, e.g., AAPL or ^NSEI"),
    interval: str = Query("15m", description="Time interval: 1m, 5m, 15m, 1h, 1d"),
    period: str = Query("60d", description="Time period: 1d, 5d, 1mo, 60d")
):
    try:
        # Fetch OHLCV
        df = market_data_provider.get_historical_data(symbol, interval, period)
        if df.empty:
            raise HTTPException(status_code=404, detail="No data found for the given symbol and parameters")
            
        # Enhance with Indicators
        df = technical_indicators.add_all_indicators(df)
        
        # Enhance with Patterns
        df = pattern_recognition.detect_patterns(df)
        
        # Convert DataFrame to Pydantic models
        enhanced_data = []
        for _, row in df.iterrows():
            indicators = IndicatorData(
                rsi=clean_nan(row.get('rsi')),
                macd=clean_nan(row.get('macd')),
                macd_signal=clean_nan(row.get('macd_signal')),
                macd_hist=clean_nan(row.get('macd_hist')),
                ema_20=clean_nan(row.get('ema_20')),
                ema_50=clean_nan(row.get('ema_50')),
                ema_200=clean_nan(row.get('ema_200')),
                vwap=clean_nan(row.get('vwap')),
                atr=clean_nan(row.get('atr')),
                bb_upper=clean_nan(row.get('bb_upper')),
                bb_middle=clean_nan(row.get('bb_middle')),
                bb_lower=clean_nan(row.get('bb_lower'))
            )
            
            patterns = PatternData(
                is_doji=bool(row.get('is_doji', False)),
                is_hammer=bool(row.get('is_hammer', False)),
                is_engulfing=bool(row.get('is_engulfing', False))
            )
            
            data_point = EnhancedMarketData(
                timestamp=row['timestamp'],
                open=float(row['open']),
                high=float(row['high']),
                low=float(row['low']),
                close=float(row['close']),
                volume=float(row['volume']),
                indicators=indicators,
                patterns=patterns
            )
            enhanced_data.append(data_point)
            
        return MarketDataResponse(
            symbol=symbol,
            interval=interval,
            data=enhanced_data
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
