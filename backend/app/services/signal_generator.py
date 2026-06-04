from app.models.signal import Signal
from app.services.market_data_provider import market_data_provider
from app.services.prediction_engine import prediction_engine
from ml_pipeline.data.feature_engineering import FeatureEngineer
import pandas as pd
import uuid
import logging

logger = logging.getLogger(__name__)

class SignalGenerator:
    def __init__(self):
        pass
        
    def generate_signal(self, symbol: str, timeframe: str = "15m") -> Signal:
        # 1. Fetch data with enough history to compute indicators and lags
        if timeframe == "1d":
            period = "2y"
        elif timeframe in ["1h", "90m"]:
            period = "2y"
        else:
            period = "60d"
            
        logger.info(f"Generating signal for {symbol} on {timeframe} using {period} history.")
        df = market_data_provider.get_historical_data(symbol, interval=timeframe, period=period)
        if df.empty or len(df) < 50:
            logger.warning(f"Insufficient data returned for {symbol} ({len(df)} rows). Cannot generate signal.")
            return None
            
        # 2. Add indicators and engineer features
        df_features = FeatureEngineer.create_features(df, is_training=False)
        if df_features.empty:
            logger.warning(f"Feature engineering returned empty DataFrame for {symbol}.")
            return None
            
        latest = df_features.iloc[-1]
        
        # 3. Create features DataFrame for ML prediction
        features_row = FeatureEngineer.extract_features(df_features.tail(1))
        
        # 4. Get ML Prediction
        ml_result = prediction_engine.get_prediction(features_row, timeframe=timeframe)
        
        direction = ml_result.get("direction", "NO TRADE")
        confidence = ml_result.get("confidence", 0.0)
        
        # 5. Filter by technical rules
        # Prevent buying if RSI is extremely overbought, or selling if oversold
        if direction == "CALL":
            if latest['rsi'] > 75:  # Overbought
                logger.info(f"CALL signal for {symbol} filtered out: RSI {latest['rsi']:.1f} is overbought (>75).")
                direction = "NO TRADE"
                confidence = 0.0
        elif direction == "PUT":
            if latest['rsi'] < 25:  # Oversold
                logger.info(f"PUT signal for {symbol} filtered out: RSI {latest['rsi']:.1f} is oversold (<25).")
                direction = "NO TRADE"
                confidence = 0.0
                
        # 6. Calculate Entry, Target, Stop Loss
        entry = float(latest['close'])
        atr = float(latest['atr']) if pd.notna(latest['atr']) else entry * 0.005
        
        if direction == "CALL":
            target = entry + (atr * 2)
            stop_loss = entry - atr
        elif direction == "PUT":
            target = entry - (atr * 2)
            stop_loss = entry + atr
        else:
            target = None
            stop_loss = None
            
        return Signal(
            _id=str(uuid.uuid4()),
            symbol=symbol,
            signal=direction,
            confidence=confidence,
            entry=entry,
            target=target,
            stop_loss=stop_loss,
            timeframe=timeframe
        )

signal_generator = SignalGenerator()
