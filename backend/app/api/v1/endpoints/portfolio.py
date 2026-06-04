from fastapi import APIRouter, Depends, HTTPException
from typing import List, Any
from pydantic import BaseModel, Field
from app.db.mongodb import get_database
import uuid

router = APIRouter()

class PortfolioItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    user_id: str
    symbol: str
    quantity: float
    average_buy_price: float
    current_price: float = 0.0

@router.get("/{user_id}", response_model=List[PortfolioItem])
async def get_portfolio(
    user_id: str,
    db: Any = Depends(get_database)
) -> Any:
    cursor = db.portfolios.find({"user_id": user_id})
    return list(cursor)

@router.post("/", response_model=PortfolioItem)
async def add_portfolio_item(
    item: PortfolioItem,
    db: Any = Depends(get_database)
) -> Any:
    db.portfolios.insert_one(item.model_dump(by_alias=True))
    return item
