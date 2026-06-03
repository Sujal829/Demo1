import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta

class MarketDataProvider:
    @staticmethod
    def get_historical_data(symbol: str, interval: str = "15m", period: str = "60d") -> pd.DataFrame:
        """
        Fetch historical OHLCV data using yfinance.
        """
        # Note: yfinance has limitations on intervals. 
        # 1m = max 7 days, 5m/15m/30m = max 60 days
        ticker = yf.Ticker(symbol)
        df = ticker.history(period=period, interval=interval)
        
        if df.empty:
            return pd.DataFrame()

        df.reset_index(inplace=True)
        # Rename columns to standard lowercase
        df.rename(columns={
            'Datetime': 'timestamp',
            'Date': 'timestamp',
            'Open': 'open',
            'High': 'high',
            'Low': 'low',
            'Close': 'close',
            'Volume': 'volume'
        }, inplace=True)
        
        # We only need OHLCV
        df = df[['timestamp', 'open', 'high', 'low', 'close', 'volume']]
        
        # Ensure timestamp is tz-naive or standard UTC for easy JSON serialization
        if df['timestamp'].dt.tz is not None:
            df['timestamp'] = df['timestamp'].dt.tz_convert('UTC').dt.tz_localize(None)
            
        return df

market_data_provider = MarketDataProvider()
