import pandas as pd
from ta.momentum import RSIIndicator
from ta.trend import MACD, EMAIndicator
from ta.volatility import AverageTrueRange, BollingerBands
from ta.volume import VolumeWeightedAveragePrice

class TechnicalIndicators:
    @staticmethod
    def add_all_indicators(df: pd.DataFrame) -> pd.DataFrame:
        if df.empty or len(df) < 50:
            return df
            
        df_ind = df.copy()
        
        # RSI
        rsi_ind = RSIIndicator(close=df_ind['close'], window=14)
        df_ind['rsi'] = rsi_ind.rsi()
        
        # MACD
        macd_ind = MACD(close=df_ind['close'], window_slow=26, window_fast=12, window_sign=9)
        df_ind['macd'] = macd_ind.macd()
        df_ind['macd_signal'] = macd_ind.macd_signal()
        df_ind['macd_hist'] = macd_ind.macd_diff()
        
        # EMAs
        df_ind['ema_20'] = EMAIndicator(close=df_ind['close'], window=20).ema_indicator()
        df_ind['ema_50'] = EMAIndicator(close=df_ind['close'], window=50).ema_indicator()
        df_ind['ema_200'] = EMAIndicator(close=df_ind['close'], window=200).ema_indicator()
        
        # ATR
        atr_ind = AverageTrueRange(high=df_ind['high'], low=df_ind['low'], close=df_ind['close'], window=14)
        df_ind['atr'] = atr_ind.average_true_range()
        
        # Bollinger Bands
        bb_ind = BollingerBands(close=df_ind['close'], window=20, window_dev=2)
        df_ind['bb_upper'] = bb_ind.bollinger_hband()
        df_ind['bb_middle'] = bb_ind.bollinger_mavg()
        df_ind['bb_lower'] = bb_ind.bollinger_lband()
        
        # VWAP
        vwap_ind = VolumeWeightedAveragePrice(
            high=df_ind['high'], low=df_ind['low'], close=df_ind['close'], volume=df_ind['volume']
        )
        df_ind['vwap'] = vwap_ind.volume_weighted_average_price()
        
        return df_ind

technical_indicators = TechnicalIndicators()
