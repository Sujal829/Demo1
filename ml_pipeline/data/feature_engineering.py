import pandas as pd
import numpy as np
from ta.momentum import RSIIndicator
from ta.trend import MACD, EMAIndicator
from ta.volatility import AverageTrueRange

class FeatureEngineer:
    @staticmethod
    def create_features(df: pd.DataFrame) -> pd.DataFrame:
        """
        Creates technical indicator features and creates the target label for ML.
        Target label: 1 if next candle close > current candle close, else 0
        """
        df = df.copy()
        
        if df.empty or len(df) < 50:
            return df

        # Technical Indicators
        df['rsi'] = RSIIndicator(close=df['close'], window=14).rsi()
        
        macd = MACD(close=df['close'])
        df['macd'] = macd.macd()
        df['macd_signal'] = macd.macd_signal()
        df['macd_hist'] = macd.macd_diff()
        
        df['ema_20'] = EMAIndicator(close=df['close'], window=20).ema_indicator()
        df['ema_50'] = EMAIndicator(close=df['close'], window=50).ema_indicator()
        
        df['atr'] = AverageTrueRange(high=df['high'], low=df['low'], close=df['close']).average_true_range()
        
        # Price change metrics
        df['return_1p'] = df['close'].pct_change(1)
        df['return_3p'] = df['close'].pct_change(3)
        
        # Volume features
        df['vol_ratio'] = df['volume'] / df['volume'].rolling(window=20).mean()
        
        # Target variable: 1 if next candle goes up, 0 if it goes down
        df['target'] = (df['close'].shift(-1) > df['close']).astype(int)
        
        # Drop rows with NaN (due to indicators and shift)
        df.dropna(inplace=True)
        
        return df

    @staticmethod
    def extract_features(df: pd.DataFrame) -> pd.DataFrame:
        """
        Extracts only the feature columns.
        """
        features = [
            'rsi', 'macd', 'macd_signal', 'macd_hist', 
            'ema_20', 'ema_50', 'atr', 'return_1p', 'return_3p', 'vol_ratio'
        ]
        return df[features]
