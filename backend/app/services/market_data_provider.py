import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

class MarketDataProvider:
    @staticmethod
    def get_historical_data(symbol: str, interval: str = "15m", period: str = "60d") -> pd.DataFrame:
        """
        Fetch historical OHLCV data directly from Yahoo Finance API using requests.
        Bypasses yfinance's crumb fetching rate limits.
        """
        try:
            import requests
            url = f"https://query2.finance.yahoo.com/v8/finance/chart/{symbol}"
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
            params = {
                'range': period,
                'interval': interval
            }
            logger.info(f"Direct fetch: {url} with range={period}, interval={interval}")
            r = requests.get(url, headers=headers, params=params, timeout=10)
            r.raise_for_status()
            data = r.json()
            
            result = data['chart']['result'][0]
            timestamps = result['timestamp']
            quote = result['indicators']['quote'][0]
            
            df = pd.DataFrame({
                'timestamp': pd.to_datetime(timestamps, unit='s'),
                'open': quote['open'],
                'high': quote['high'],
                'low': quote['low'],
                'close': quote['close'],
                'volume': quote['volume']
            })
            
            if df.empty:
                logger.warning(f"No data returned for {symbol}, generating mock data.")
                return MarketDataProvider.generate_mock_data(symbol, interval, period)
                
            df.dropna(inplace=True)
            df.reset_index(drop=True, inplace=True)
            
            if df['timestamp'].dt.tz is not None:
                df['timestamp'] = df['timestamp'].dt.tz_convert('UTC').dt.tz_localize(None)
                
            return df
        except Exception as e:
            logger.error(f"Error fetching data for {symbol}: {e}. Generating mock data.")
            return MarketDataProvider.generate_mock_data(symbol, interval, period)

    @staticmethod
    def generate_mock_data(symbol: str, interval: str, period: str) -> pd.DataFrame:
        """
        Generates dummy OHLCV data for testing.
        """
        dates = pd.date_range(end=datetime.now(), periods=100, freq='15min' if 'm' in interval else 'D')
        data = {
            'timestamp': dates,
            'open': np.random.uniform(100, 200, 100),
            'high': np.random.uniform(200, 210, 100),
            'low': np.random.uniform(90, 100, 100),
            'close': np.random.uniform(100, 200, 100),
            'volume': np.random.uniform(1000, 5000, 100)
        }
        return pd.DataFrame(data)

market_data_provider = MarketDataProvider()
