from app.models.signal import Signal
from app.services.market_data_provider import market_data_provider
from app.services.technical_indicators import technical_indicators
from app.services.pattern_recognition import pattern_recognition
from app.services.prediction_engine import prediction_engine
import pandas as pd
import uuid

class SignalGenerator:
    def __init__(self):
        # We can dynamically load ML features module if needed
        # For this script we will use some hardcoded rules combined with ML output
        pass
        
    def generate_signal(self, symbol: str, timeframe: str = "15m") -> Signal:
        # 1. Fetch data
        df = market_data_provider.get_historical_data(symbol, interval=timeframe, period="5d")
        if df.empty:
            return None
            
        # 2. Add indicators
        df = technical_indicators.add_all_indicators(df)
        df = pattern_recognition.detect_patterns(df)
        
        latest = df.iloc[-1]
        
        # 3. Create features for ML
        # In a real scenario, you'd extract exactly the features the model expects
        features = pd.DataFrame([{
            'rsi': latest['rsi'],
            'macd': latest['macd'],
            'macd_signal': latest['macd_signal'],
            'macd_hist': latest['macd_hist'],
            'ema_20': latest['ema_20'],
            'ema_50': latest['ema_50'],
            'atr': latest['atr'],
            'return_1p': latest['close'] / df.iloc[-2]['close'] - 1,
            'return_3p': latest['close'] / df.iloc[-4]['close'] - 1 if len(df) > 4 else 0,
            'vol_ratio': latest['volume'] / df['volume'].mean()
        }])
        
        # 4. Get ML Prediction
        ml_result = prediction_engine.get_prediction(features)
        
        direction = ml_result.get("direction", "NO TRADE")
        confidence = ml_result.get("confidence", 0.0)
        
        # 5. Filter by technical rules
        if direction == "CALL":
            if latest['rsi'] > 70:  # Overbought
                direction = "NO TRADE"
                confidence = 0.0
        elif direction == "PUT":
            if latest['rsi'] < 30:  # Oversold
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
