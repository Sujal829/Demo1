from app.worker import celery_app
from app.services.signal_generator import signal_generator
from app.db.mongodb import db, connect_to_mongo
import asyncio
import logging

logger = logging.getLogger(__name__)

# List of symbols to monitor automatically
WATCHLIST = ["^NSEI", "^BSESN", "RELIANCE.NS", "HDFCBANK.NS"]

@celery_app.task
def fetch_latest_data_and_generate_signals():
    """
    Periodic task to fetch data and generate signals for watchlisted items.
    """
    logger.info("Running periodic signal generation task...")
    
    # We need an event loop since we might interact with Async MongoDB
    loop = asyncio.get_event_loop()
    if loop.is_closed():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
    loop.run_until_complete(_run_generation())

async def _run_generation():
    # Ensure DB is connected in worker context
    if db.client is None:
        await connect_to_mongo()
        
    timeframes = ["15m", "30m", "1h", "1d"]
    for symbol in WATCHLIST:
        for tf in timeframes:
            try:
                signal = signal_generator.generate_signal(symbol, timeframe=tf)
                if signal and signal.signal != "NO TRADE":
                    # Save to DB (Synchronously using pymongo)
                    db.client["trading_db"].signals.insert_one(signal.model_dump(by_alias=True))
                    logger.info(f"Generated new signal for {symbol} ({tf}): {signal.signal}")
                    
                    # Broadcast the new signal in real-time
                    import requests
                    try:
                        sig_json = signal.model_dump_json(by_alias=True)
                        headers = {"Content-Type": "application/json"}
                        requests.post("http://127.0.0.1:8000/api/v1/signals/broadcast", data=sig_json, headers=headers, timeout=2)
                    except Exception as broadcast_err:
                        logger.error(f"Failed to broadcast signal for {symbol} ({tf}): {broadcast_err}")
            except Exception as e:
                logger.error(f"Error generating signal for {symbol} ({tf}): {e}")
