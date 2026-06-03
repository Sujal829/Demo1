from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "trading_worker",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.tasks.market_tasks"]
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

# Optional: Periodic tasks setup
celery_app.conf.beat_schedule = {
    "fetch-market-data-every-minute": {
        "task": "app.tasks.market_tasks.fetch_latest_data_and_generate_signals",
        "schedule": 60.0,
    }
}
