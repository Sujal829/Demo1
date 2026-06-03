import pandas as pd
import numpy as np

class PatternRecognition:
    @staticmethod
    def detect_patterns(df: pd.DataFrame) -> pd.DataFrame:
        if df.empty:
            return df
            
        df_pat = df.copy()
        
        # Calculate basic metrics
        body = np.abs(df_pat['close'] - df_pat['open'])
        range_ = df_pat['high'] - df_pat['low']
        upper_shadow = np.maximum(df_pat['high'] - df_pat['close'], df_pat['high'] - df_pat['open'])
        lower_shadow = np.maximum(df_pat['close'] - df_pat['low'], df_pat['open'] - df_pat['low'])
        
        # Doji: body is very small compared to the range
        df_pat['is_doji'] = body <= (range_ * 0.1)
        
        # Hammer: small body, long lower shadow (>= 2x body), small upper shadow
        df_pat['is_hammer'] = (lower_shadow >= (body * 2)) & (upper_shadow <= (body * 0.5))
        
        # Engulfing (Bullish and Bearish combined here as boolean flag for simplicity)
        # Proper engulfing requires checking previous candle, here is a simple implementation
        prev_body = body.shift(1)
        prev_open = df_pat['open'].shift(1)
        prev_close = df_pat['close'].shift(1)
        
        bullish_engulfing = (prev_close < prev_open) & (df_pat['close'] > df_pat['open']) & \
                            (df_pat['close'] > prev_open) & (df_pat['open'] < prev_close)
                            
        bearish_engulfing = (prev_close > prev_open) & (df_pat['close'] < df_pat['open']) & \
                            (df_pat['close'] < prev_open) & (df_pat['open'] > prev_close)
                            
        df_pat['is_engulfing'] = bullish_engulfing | bearish_engulfing
        
        # Fill NaN for early rows
        df_pat.fillna(False, inplace=True)
        
        return df_pat

pattern_recognition = PatternRecognition()
