from fastapi import APIRouter
from app.api.v1.endpoints import auth, market, signals, portfolio

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(market.router, prefix="/market", tags=["market"])
api_router.include_router(signals.router, prefix="/signals", tags=["signals"])
api_router.include_router(portfolio.router, prefix="/portfolio", tags=["portfolio"])
