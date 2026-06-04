import pandas as pd
import numpy as np
from ta.momentum import RSIIndicator, StochasticOscillator
from ta.trend import MACD, EMAIndicator, ADXIndicator
from ta.volatility import AverageTrueRange, BollingerBands

class FeatureEngineer:
    @staticmethod
    def create_features(df: pd.DataFrame, is_training: bool = True) -> pd.DataFrame:
        """
        Creates technical indicator features and target labels for ML.
        If is_training is True, creates the target label and drops all NaNs.
        If is_training is False, does not create target and preserves the latest row.
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
        
        # Stochastic Oscillator
        stoch = StochasticOscillator(high=df['high'], low=df['low'], close=df['close'], window=14, smooth_window=3)
        df['stoch_k'] = stoch.stoch()
        df['stoch_d'] = stoch.stoch_signal()
        
        # ADX
        adx = ADXIndicator(high=df['high'], low=df['low'], close=df['close'], window=14)
        df['adx'] = adx.adx()
        df['adx_pos'] = adx.adx_pos()
        df['adx_neg'] = adx.adx_neg()
        
        # Bollinger Bands
        bb = BollingerBands(close=df['close'], window=20, window_dev=2)
        df['bb_high'] = bb.bollinger_hband()
        df['bb_low'] = bb.bollinger_lband()
        df['bb_mid'] = bb.bollinger_mavg()
        
        # Price change metrics
        df['return_1p'] = df['close'].pct_change(1)
        df['return_3p'] = df['close'].pct_change(3)
        df['return_5p'] = df['close'].pct_change(5)
        
        # Lag features
        for lag in [1, 2, 3]:
            df[f'return_1p_lag_{lag}'] = df['return_1p'].shift(lag)
            df[f'rsi_lag_{lag}'] = df['rsi'].shift(lag)
            
        # Volume features - Safely handle division by zero (common in indices where volume is 0)
        rolling_vol_mean = df['volume'].rolling(window=20).mean()
        df['vol_ratio'] = np.where(
            (rolling_vol_mean > 0) & (df['volume'] > 0),
            df['volume'] / rolling_vol_mean,
            1.0
        )
        
        if is_training:
            # Target variable: 1 if 7-day EMA goes up tomorrow, else 0
            df['ema_target'] = EMAIndicator(close=df['close'], window=7).ema_indicator()
            df['target'] = (df['ema_target'].shift(-1) > df['ema_target']).astype(int)
            # Drop rows with NaN (due to indicators and shift)
            df.dropna(inplace=True)
        else:
            # For inference, drop rows that have NaN in the features (first 50 rows)
            # but keep the last row which has feature values
            feature_cols = FeatureEngineer.get_feature_names()
            df.dropna(subset=feature_cols, inplace=True)
            
        return df

    @staticmethod
    def get_feature_names() -> list:
        """
        Returns the exact list of features used in the ML model.
        """
        return [
            'rsi', 'macd', 'macd_signal', 'macd_hist', 'ema_20', 'ema_50', 'atr',
            'stoch_k', 'stoch_d', 'adx', 'adx_pos', 'adx_neg', 'bb_high', 'bb_low', 'bb_mid',
            'return_1p', 'return_3p', 'return_5p', 'vol_ratio',
            'return_1p_lag_1', 'return_1p_lag_2', 'return_1p_lag_3',
            'rsi_lag_1', 'rsi_lag_2', 'rsi_lag_3'
        ]

    @staticmethod
    def extract_features(df: pd.DataFrame) -> pd.DataFrame:
        """
        Extracts only the feature columns.
        """
        return df[FeatureEngineer.get_feature_names()]
