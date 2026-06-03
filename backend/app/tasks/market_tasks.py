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
        
    for symbol in WATCHLIST:
        try:
            signal = signal_generator.generate_signal(symbol)
            if signal and signal.signal != "NO TRADE":
                # Save to DB
                await db.client["trading_db"].signals.insert_one(signal.model_dump(by_alias=True))
                logger.info(f"Generated new signal for {symbol}: {signal.signal}")
                
                # Here we could also trigger a WebSocket broadcast
                # We will handle real-time via Socket.IO directly later
        except Exception as e:
            logger.error(f"Error generating signal for {symbol}: {e}")
