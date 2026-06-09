"""
main.py
Notefolio FastAPI 애플리케이션 진입점 및 전체 라우터 정의
"""

import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

import httpx
import yfinance as yf
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from database import (
    Account,
    AccountHolding,
    CashBalance,
    MarketSentimentCache,
    StockMeta,
    StockPriceCache,
    Trade,
    get_db,
    init_db,
)
from scheduler import start_scheduler, stop_scheduler

from auth import create_access_token, get_current_user
from database import User

# ─────────────────────────────────────────────
# 로거
# ─────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("notefolio")


# ─────────────────────────────────────────────
# 앱 생명주기
# ─────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("DB 초기화 중...")
    init_db()
    logger.info("DB 초기화 완료")
    start_scheduler()
    yield
    stop_scheduler()
    logger.info("서버 종료")


app = FastAPI(
    title="Notefolio API",
    description="개인 투자자를 위한 자산 관리 API",
    version="1.0.0",
    lifespan=lifespan,
)

# 💡 CORS 설정 (localhost 및 127.0.0.1 모두 허용)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────
# Pydantic 스키마
# ─────────────────────────────────────────────

class InviteCodeRequest(BaseModel):
    invite_code: str

@app.post("/api/auth/login", tags=["인증"])
def login_with_invite_code(body: InviteCodeRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter_by(invite_code=body.invite_code, is_active=True).first()
    if not user:
        raise HTTPException(status_code=401, detail="유효하지 않은 초대 코드입니다.")

    token = create_access_token(user.id, user.name)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user_id": user.id,
        "name": user.name,
    }

@app.get("/api/auth/me", tags=["인증"])
def get_me(current_user: User = Depends(get_current_user)):
    return {"id": current_user.id, "name": current_user.name}


class AccountCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    account_type: str = Field(..., min_length=1, max_length=50)
    currency: str = Field(default="USD", max_length=10)
    description: str | None = None

class AccountUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=100)
    account_type: str | None = Field(default=None, max_length=50)
    description: str | None = None
    is_active: bool | None = None
    initial_cash: float | None = Field(default=None, ge=0)

class CashUpdate(BaseModel):
    amount: float = Field(..., ge=0)
    currency: str = Field(default="USD", max_length=10)

class AccountOut(BaseModel):
    id: int
    name: str
    account_type: str
    currency: str
    description: str | None
    is_active: bool
    created_at: datetime
    cash_amount: float = 0.0

    class Config:
        from_attributes = True

class HoldingCreate(BaseModel):
    account_id: int
    ticker: str = Field(..., min_length=1, max_length=20)
    avg_price: float = Field(..., gt=0)
    quantity: float = Field(..., gt=0)
    memo: str | None = None

    @field_validator("ticker")
    @classmethod
    def upper_ticker(cls, v: str) -> str:
        return v.strip().upper()

class HoldingUpdate(BaseModel):
    avg_price: float | None = Field(default=None, gt=0)
    quantity: float | None = Field(default=None, gt=0)
    memo: str | None = None

class PriceInfo(BaseModel):
    current_price: float | None
    change_pct: float | None
    market_cap: float | None
    shares_outstanding: float | None
    per: float | None
    forward_per: float | None
    psr: float | None
    eps: float | None
    week52_low_pct: float | None
    cached_at: datetime | None

    class Config:
        from_attributes = True

class HoldingOut(BaseModel):
    id: int
    account_id: int
    ticker: str
    avg_price: float
    quantity: float
    memo: str | None
    created_at: datetime
    updated_at: datetime
    name: str | None = None
    sector: str | None = None
    industry: str | None = None
    exchange: str | None = None
    price_info: PriceInfo | None = None

    class Config:
        from_attributes = True

class TradeCreate(BaseModel):
    holding_id: int
    account_id: int
    ticker: str = Field(..., min_length=1, max_length=20)
    trade_type: str = Field(..., pattern="^(BUY|SELL)$")
    quantity: float = Field(..., gt=0)
    price: float = Field(..., gt=0)
    memo: str | None = None
    tags: list[str] = Field(default_factory=list)
    traded_at: datetime

    @field_validator("ticker")
    @classmethod
    def upper_ticker(cls, v: str) -> str:
        return v.strip().upper()

class TradeOut(BaseModel):
    id: int
    holding_id: int
    account_id: int
    ticker: str
    trade_type: str
    quantity: float
    price: float
    realized_pnl: float | None
    memo: str | None
    tags: list[str]
    traded_at: datetime
    created_at: datetime

    @classmethod
    def from_orm_trade(cls, t: Trade) -> "TradeOut":
        return cls(
            id=t.id,
            holding_id=t.holding_id,
            account_id=t.account_id,
            ticker=t.ticker,
            trade_type=t.trade_type,
            quantity=t.quantity,
            price=t.price,
            realized_pnl=t.realized_pnl,
            memo=t.memo,
            tags=json.loads(t.tags) if t.tags else [],
            traded_at=t.traded_at,
            created_at=t.created_at,
        )


# ─────────────────────────────────────────────
# 내부 헬퍼 로직 (환율 적용)
# ─────────────────────────────────────────────

def _get_usd_to_krw():
    """실시간 원달러 환율 가져오기 (실패 시 1400원 고정)"""
    try:
        ticker = yf.Ticker("USDKRW=X")
        rate = ticker.fast_info.get("lastPrice")
        if rate:
            return float(rate)
    except:
        pass
    return 1400.0

def _fetch_and_save_stock_meta(ticker: str, db: Session) -> StockMeta:
    existing = db.get(StockMeta, ticker)
    if existing:
        return existing

    try:
        info = yf.Ticker(ticker).info
        if not info or info.get("trailingPegRatio") is None and info.get("symbol") is None:
            raise HTTPException(status_code=404, detail=f"티커를 찾을 수 없습니다: {ticker}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"yfinance 오류: {e}")

    meta = StockMeta(
        ticker=ticker,
        name=info.get("longName") or info.get("shortName") or ticker,
        sector=info.get("sector"),
        industry=info.get("industry"),
        exchange=info.get("exchange"),
        last_synced_at=datetime.now(timezone.utc),
    )
    db.add(meta)

    current_price = info.get("currentPrice") or info.get("regularMarketPrice")
    prev_close = info.get("previousClose") or info.get("regularMarketPreviousClose")
    change_pct = None
    if current_price and prev_close and prev_close != 0:
        change_pct = (current_price - prev_close) / prev_close * 100

    week52_low = info.get("fiftyTwoWeekLow")
    week52_low_pct = None
    if current_price and week52_low and week52_low != 0:
        week52_low_pct = (current_price - week52_low) / week52_low * 100

    cache = StockPriceCache(
        ticker=ticker,
        current_price=current_price,
        change_pct=change_pct,
        market_cap=info.get("marketCap"),
        shares_outstanding=info.get("sharesOutstanding"),
        per=info.get("trailingPE"),
        forward_per=info.get("forwardPE"),
        psr=info.get("priceToSalesTrailing12Months"),
        eps=info.get("trailingEps"),
        week52_low_pct=week52_low_pct,
        cached_at=datetime.now(timezone.utc),
    )
    db.add(cache)
    db.commit()
    db.refresh(meta)
    return meta

def _holding_to_out(h: AccountHolding, usd_to_krw: float) -> HoldingOut:
    """Holding 정보를 내보낼 때, 미국 주식이면 현재가(달러)에 환율을 곱해 원화로 변환합니다."""
    price_info = None
    if h.stock_meta and h.stock_meta.price_cache:
        pc = h.stock_meta.price_cache
        ticker = h.ticker
        exchange = h.stock_meta.exchange
        is_krw = ticker.endswith(".KS") or ticker.endswith(".KQ") or exchange in ["KOSPI", "KOSDAQ"]
        
        current_price_krw = pc.current_price
        if pc.current_price and not is_krw:
            current_price_krw = pc.current_price * usd_to_krw
            
        price_info = PriceInfo(
            current_price=current_price_krw,
            change_pct=pc.change_pct,
            market_cap=pc.market_cap,
            shares_outstanding=pc.shares_outstanding,
            per=pc.per,
            forward_per=pc.forward_per,
            psr=pc.psr,
            eps=pc.eps,
            week52_low_pct=pc.week52_low_pct,
            cached_at=pc.cached_at,
        )
    return HoldingOut(
        id=h.id,
        account_id=h.account_id,
        ticker=h.ticker,
        avg_price=h.avg_price,
        quantity=h.quantity,
        memo=h.memo,
        created_at=h.created_at,
        updated_at=h.updated_at,
        name=h.stock_meta.name if h.stock_meta else None,
        sector=h.stock_meta.sector if h.stock_meta else None,
        industry=h.stock_meta.industry if h.stock_meta else None,
        exchange=h.stock_meta.exchange if h.stock_meta else None,
        price_info=price_info,
    )


# ─────────────────────────────────────────────
# 라우터: 계좌 (Accounts)
# ─────────────────────────────────────────────

@app.get("/api/accounts", response_model=list[AccountOut], tags=["계좌"])
def list_accounts(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    accounts = (
        db.query(Account)
        .options(joinedload(Account.cash_balance))
        .filter(Account.is_active == True, Account.user_id == current_user.id)
        .order_by(Account.created_at)
        .all()
    )
    result = []
    for acc in accounts:
        cash = acc.cash_balance.amount if acc.cash_balance else 0.0
        result.append(AccountOut(
            id=acc.id,
            name=acc.name,
            account_type=acc.account_type,
            currency=acc.currency,
            description=acc.description,
            is_active=acc.is_active,
            created_at=acc.created_at,
            cash_amount=cash,
        ))
    return result

@app.post("/api/accounts", response_model=AccountOut, status_code=201, tags=["계좌"])
def create_account(body: AccountCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    acc = Account(**body.model_dump())
    acc.user_id = current_user.id  
    db.add(acc)
    db.flush()

    cash = CashBalance(
        account_id=acc.id, 
        amount=0.0, 
        currency=body.currency,
        user_id=current_user.id
    )
    db.add(cash)
    db.commit()
    db.refresh(acc)

    return AccountOut(
        id=acc.id,
        name=acc.name,
        account_type=acc.account_type,
        currency=acc.currency,
        description=body.description,
        is_active=acc.is_active,
        created_at=acc.created_at,
        cash_amount=0.0,
    )

@app.get("/api/accounts/{account_id}", response_model=AccountOut, tags=["계좌"])
def get_account(account_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    acc = db.query(Account).options(joinedload(Account.cash_balance)).filter(Account.id == account_id, Account.user_id == current_user.id).first()
    if not acc:
        raise HTTPException(status_code=404, detail="계좌를 찾을 수 없습니다.")
    return AccountOut(
        id=acc.id,
        name=acc.name,
        account_type=acc.account_type,
        currency=acc.currency,
        description=acc.description,
        is_active=acc.is_active,
        created_at=acc.created_at,
        cash_amount=acc.cash_balance.amount if acc.cash_balance else 0.0,
    )

@app.put("/api/accounts/{account_id}", response_model=AccountOut, tags=["계좌"])
def update_account(account_id: int, body: AccountUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    acc = db.query(Account).filter(Account.id == account_id, Account.user_id == current_user.id).first()
    if not acc:
        raise HTTPException(status_code=404, detail="계좌를 찾을 수 없습니다.")

    update_data = body.model_dump(exclude_none=True)
    initial_cash = update_data.pop("initial_cash", None)

    for field, value in update_data.items():
        setattr(acc, field, value)

    if initial_cash is not None:
        cash = db.query(CashBalance).filter_by(account_id=account_id).first()
        if cash:
            cash.amount = initial_cash
        else:
            cash = CashBalance(account_id=account_id, amount=initial_cash, currency=acc.currency, user_id=current_user.id)
            db.add(cash)

    db.commit()
    db.refresh(acc)
    cash_amount = acc.cash_balance.amount if acc.cash_balance else 0.0
    return AccountOut(
        id=acc.id,
        name=acc.name,
        account_type=acc.account_type,
        currency=acc.currency,
        description=acc.description,
        is_active=acc.is_active,
        created_at=acc.created_at,
        cash_amount=cash_amount,
    )

@app.delete("/api/accounts/{account_id}", status_code=204, tags=["계좌"])
def delete_account(account_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    acc = db.query(Account).filter(Account.id == account_id, Account.user_id == current_user.id).first()
    if not acc:
        raise HTTPException(status_code=404, detail="계좌를 찾을 수 없습니다.")
    db.delete(acc)
    db.commit()

@app.put("/api/accounts/{account_id}/cash", tags=["계좌"])
def update_cash(account_id: int, body: CashUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    acc = db.query(Account).filter(Account.id == account_id, Account.user_id == current_user.id).first()
    if not acc:
        raise HTTPException(status_code=404, detail="계좌를 찾을 수 없습니다.")

    cash = db.query(CashBalance).filter_by(account_id=account_id).first()
    if cash:
        cash.amount = body.amount
        cash.currency = body.currency
    else:
        cash = CashBalance(account_id=account_id, amount=body.amount, currency=body.currency, user_id=current_user.id)
        db.add(cash)

    db.commit()
    return {"account_id": account_id, "amount": body.amount, "currency": body.currency}


# ─────────────────────────────────────────────
# 라우터: 포트폴리오 요약 (Dashboard)
# ─────────────────────────────────────────────

@app.get("/api/portfolio/summary", tags=["포트폴리오"])
def portfolio_summary(
    account_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    usd_to_krw = _get_usd_to_krw()

    def is_krw_stock(ticker: str, exchange: str | None) -> bool:
        return ticker.endswith(".KS") or ticker.endswith(".KQ") or exchange in ["KOSPI", "KOSDAQ"]

    accounts = db.query(Account).filter(Account.is_active == True).all()
    account_map = {a.id: a for a in accounts}

    q = db.query(AccountHolding).options(
        joinedload(AccountHolding.stock_meta).joinedload(StockMeta.price_cache)
    )
    if account_id:
        q = q.filter(AccountHolding.account_id == account_id)
    holdings = q.all()

    cash_q = db.query(CashBalance)
    if account_id:
        cash_q = cash_q.filter(CashBalance.account_id == account_id)
    cash_rows = cash_q.all()

    total_cash_krw = 0.0
    total_stock_buy_krw = 0.0
    total_stock_eval_krw = 0.0

    account_summary = {}
    for acc in accounts:
        account_summary[acc.id] = {
            "id": acc.id,
            "name": acc.name,
            "cash": 0.0,
            "stock_buy": 0.0,
            "stock_eval": 0.0
        }

    for c in cash_rows:
        if c.account_id in account_map:
            total_cash_krw += c.amount
            account_summary[c.account_id]["cash"] += c.amount

    ticker_map = {}
    sector_map = {}

    for h in holdings:
        pc = h.stock_meta.price_cache if h.stock_meta else None
        exchange = h.stock_meta.exchange if h.stock_meta else None

        buy_price_krw = h.avg_price
        qty = h.quantity

        if pc and pc.current_price:
            if is_krw_stock(h.ticker, exchange):
                current_price_krw = pc.current_price
            else:
                current_price_krw = pc.current_price * usd_to_krw
        else:
            current_price_krw = buy_price_krw

        buy_val_krw = buy_price_krw * qty
        eval_val_krw = current_price_krw * qty

        total_stock_buy_krw += buy_val_krw
        total_stock_eval_krw += eval_val_krw

        if h.account_id in account_summary:
            account_summary[h.account_id]["stock_buy"] += buy_val_krw
            account_summary[h.account_id]["stock_eval"] += eval_val_krw

        ticker = h.ticker
        if ticker not in ticker_map:
            ticker_map[ticker] = {"ticker": ticker, "name": h.stock_meta.name if h.stock_meta else ticker, "value": 0.0}
        ticker_map[ticker]["value"] += eval_val_krw

        sector = (h.stock_meta.sector if h.stock_meta else None) or "기타"
        sector_map[sector] = sector_map.get(sector, 0.0) + eval_val_krw

    total_asset_krw = total_stock_eval_krw + total_cash_krw
    total_investment_krw = total_stock_buy_krw + total_cash_krw

    def with_pct(items: list[dict], value_key: str) -> list[dict]:
        for item in items:
            item["pct"] = round(item[value_key] / total_asset_krw * 100, 2) if total_asset_krw > 0 else 0.0
        return sorted(items, key=lambda x: x[value_key], reverse=True)

    ticker_weights = with_pct(list(ticker_map.values()), "value")
    sector_weights = with_pct([{"sector": k, "value": v} for k, v in sector_map.items()], "value")
    account_weights = with_pct([{"sector": v["name"], "value": v["stock_eval"] + v["cash"]} for v in account_summary.values()], "value")

    return {
        "total_asset": round(total_asset_krw, 2),
        "total_investment": round(total_investment_krw, 2),
        "total_stock_value": round(total_stock_eval_krw, 2),
        "total_stock_buy": round(total_stock_buy_krw, 2),
        "total_cash": round(total_cash_krw, 2),
        "cash_pct": round(total_cash_krw / total_asset_krw * 100, 2) if total_asset_krw > 0 else 0.0,
        "sector_weights": sector_weights,
        "ticker_weights": ticker_weights,
        "account_weights": account_weights,
        "accounts_summary": list(account_summary.values()),
        "exchange_rate": usd_to_krw
    }


# ─────────────────────────────────────────────
# 라우터: 종목 검색 (Stock Search)
# ─────────────────────────────────────────────

@app.get("/api/stocks/search", tags=["종목 검색"])
def search_stock(
    q: str = Query(..., min_length=1, description="티커 또는 종목명"),
    db: Session = Depends(get_db),
):
    q_upper = q.strip().upper()

    cached = db.get(StockMeta, q_upper)
    if cached:
        pc = cached.price_cache
        return {
            "source": "cache",
            "results": [{
                "ticker": cached.ticker,
                "name": cached.name,
                "sector": cached.sector,
                "exchange": cached.exchange,
                "current_price": pc.current_price if pc else None,
                "change_pct": pc.change_pct if pc else None,
            }],
        }

    try:
        search_result = yf.Search(q, max_results=8)
        quotes = search_result.quotes
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"검색 오류: {e}")

    results = [
        {
            "ticker": item.get("symbol", ""),
            "name": item.get("longname") or item.get("shortname", ""),
            "exchange": item.get("exchange", ""),
            "sector": item.get("sector"),
            "current_price": None,
            "change_pct": None,
        }
        for item in quotes
        if item.get("symbol")
    ]
    return {"source": "yfinance", "results": results}


# ─────────────────────────────────────────────
# 라우터: 보유 종목 (Holdings)
# ─────────────────────────────────────────────

@app.get("/api/holdings", response_model=list[HoldingOut], tags=["보유 종목"])
def list_holdings(
    account_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    usd_to_krw = _get_usd_to_krw()
    q = db.query(AccountHolding).options(
        joinedload(AccountHolding.stock_meta).joinedload(StockMeta.price_cache)
    )
    if account_id:
        q = q.filter(AccountHolding.account_id == account_id)

    holdings = q.order_by(AccountHolding.created_at.desc()).all()
    return [_holding_to_out(h, usd_to_krw) for h in holdings]


@app.post("/api/holdings", response_model=HoldingOut, status_code=201, tags=["보유 종목"])
def create_holding(body: HoldingCreate, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    usd_to_krw = _get_usd_to_krw()
    acc = db.get(Account, body.account_id)
    if not acc:
        raise HTTPException(status_code=404, detail="계좌를 찾을 수 없습니다.")

    _fetch_and_save_stock_meta(body.ticker, db)

    existing = (
        db.query(AccountHolding)
        .filter_by(account_id=body.account_id, ticker=body.ticker)
        .first()
    )
    if existing:
        total_cost = existing.avg_price * existing.quantity + body.avg_price * body.quantity
        existing.quantity += body.quantity
        existing.avg_price = total_cost / existing.quantity
        if body.memo:
            existing.memo = body.memo
        db.commit()
        target_holding = existing
    else:
        holding = AccountHolding(
            account_id=body.account_id,
            ticker=body.ticker,
            avg_price=body.avg_price,
            quantity=body.quantity,
            memo=body.memo,
            user_id=current_user.id
        )
        db.add(holding)
        db.flush()
        target_holding = holding

    # 보유 종목 추가 시 매매 기록(Trade) 1번만 안전하게 동시 생성
    trade = Trade(
        holding_id=target_holding.id,
        account_id=body.account_id,
        ticker=body.ticker,
        trade_type="BUY",
        quantity=body.quantity,
        price=body.avg_price,
        memo=body.memo,
        traded_at=datetime.now(timezone.utc),
        user_id=current_user.id
    )
    db.add(trade)
    db.commit()

    target_holding = (
        db.query(AccountHolding)
        .options(joinedload(AccountHolding.stock_meta).joinedload(StockMeta.price_cache))
        .get(target_holding.id)
    )
    return _holding_to_out(target_holding, usd_to_krw)


@app.get("/api/holdings/{holding_id}", response_model=HoldingOut, tags=["보유 종목"])
def get_holding(holding_id: int, db: Session = Depends(get_db)):
    usd_to_krw = _get_usd_to_krw()
    h = (
        db.query(AccountHolding)
        .options(joinedload(AccountHolding.stock_meta).joinedload(StockMeta.price_cache))
        .get(holding_id)
    )
    if not h:
        raise HTTPException(status_code=404, detail="보유 종목을 찾을 수 없습니다.")
    return _holding_to_out(h, usd_to_krw)


@app.put("/api/holdings/{holding_id}", response_model=HoldingOut, tags=["보유 종목"])
def update_holding(holding_id: int, body: HoldingUpdate, db: Session = Depends(get_db)):
    usd_to_krw = _get_usd_to_krw()
    h = db.get(AccountHolding, holding_id)
    if not h:
        raise HTTPException(status_code=404, detail="보유 종목을 찾을 수 없습니다.")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(h, field, value)

    db.commit()
    h = (
        db.query(AccountHolding)
        .options(joinedload(AccountHolding.stock_meta).joinedload(StockMeta.price_cache))
        .get(holding_id)
    )
    return _holding_to_out(h, usd_to_krw)


@app.delete("/api/holdings/{holding_id}", status_code=204, tags=["보유 종목"])
def delete_holding(holding_id: int, db: Session = Depends(get_db)):
    h = db.get(AccountHolding, holding_id)
    if not h:
        raise HTTPException(status_code=404, detail="보유 종목을 찾을 수 없습니다.")
    db.delete(h)
    db.commit()


# ─────────────────────────────────────────────
# 라우터: 매매 기록 (Trades)
# ─────────────────────────────────────────────

@app.get("/api/trades", tags=["매매 기록"])
def list_trades(
    account_id: int | None = Query(default=None),
    ticker: str | None = Query(default=None),
    trade_type: str | None = Query(default=None, pattern="^(BUY|SELL)$"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    q = db.query(Trade)
    if account_id:
        q = q.filter(Trade.account_id == account_id)
    if ticker:
        q = q.filter(Trade.ticker == ticker.upper())
    if trade_type:
        q = q.filter(Trade.trade_type == trade_type)

    total = q.count()
    trades = q.order_by(Trade.traded_at.desc()).offset(offset).limit(limit).all()

    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "items": [TradeOut.from_orm_trade(t) for t in trades],
    }


@app.post("/api/trades", response_model=TradeOut, status_code=201, tags=["매매 기록"])
def create_trade(body: TradeCreate, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    holding = db.get(AccountHolding, body.holding_id)
    if not holding:
        raise HTTPException(status_code=404, detail="포지션을 찾을 수 없습니다.")
    if holding.account_id != body.account_id:
        raise HTTPException(status_code=400, detail="account_id가 포지션의 계좌와 일치하지 않습니다.")

    realized_pnl: float | None = None

    if body.trade_type == "BUY":
        total_cost = holding.avg_price * holding.quantity + body.price * body.quantity
        holding.quantity += body.quantity
        holding.avg_price = total_cost / holding.quantity

    elif body.trade_type == "SELL":
        if body.quantity > holding.quantity:
            raise HTTPException(
                status_code=400,
                detail=f"매도 수량({body.quantity})이 보유 수량({holding.quantity})을 초과합니다.",
            )
        realized_pnl = round((body.price - holding.avg_price) * body.quantity, 4)
        holding.quantity -= body.quantity

    trade = Trade(
        holding_id=body.holding_id,
        account_id=body.account_id,
        ticker=body.ticker,
        trade_type=body.trade_type,
        quantity=body.quantity,
        price=body.price,
        realized_pnl=realized_pnl,
        memo=body.memo,
        tags=json.dumps(body.tags, ensure_ascii=False) if body.tags else None,
        traded_at=body.traded_at,
        user_id=current_user.id
    )
    db.add(trade)
    db.commit()
    db.refresh(trade)

    logger.info(
        f"[TRADE] {body.trade_type} {body.quantity} {body.ticker} "
        f"@ {body.price} | account={body.account_id} | pnl={realized_pnl}"
    )
    return TradeOut.from_orm_trade(trade)


@app.get("/api/trades/{trade_id}", response_model=TradeOut, tags=["매매 기록"])
def get_trade(trade_id: int, db: Session = Depends(get_db)):
    t = db.get(Trade, trade_id)
    if not t:
        raise HTTPException(status_code=404, detail="매매 기록을 찾을 수 없습니다.")
    return TradeOut.from_orm_trade(t)


@app.delete("/api/trades/{trade_id}", status_code=204, tags=["매매 기록"])
def delete_trade(trade_id: int, db: Session = Depends(get_db)):
    t = db.get(Trade, trade_id)
    if not t:
        raise HTTPException(status_code=404, detail="매매 기록을 찾을 수 없습니다.")
    db.delete(t)
    db.commit()


# ─────────────────────────────────────────────
# 라우터: 시장 심리 (Market Sentiment)
# ─────────────────────────────────────────────

@app.get("/api/market/sentiment", tags=["시장 심리"])
def get_market_sentiment(db: Session = Depends(get_db)):
    CACHE_TTL_MINUTES = 60

    row = db.query(MarketSentimentCache).filter_by(indicator_name="fear_and_greed").first()

    now = datetime.now(timezone.utc)
    if row and row.cached_at:
        cached_at = row.cached_at.replace(tzinfo=timezone.utc) if row.cached_at.tzinfo is None else row.cached_at
        age_minutes = (now - cached_at).total_seconds() / 60
        if age_minutes < CACHE_TTL_MINUTES:
            return {
                "indicator": "fear_and_greed",
                "value": row.value,
                "classification": row.classification,
                "cached_at": row.cached_at,
                "source": "cache",
            }

    try:
        resp = httpx.get(
            "https://production.dataviz.cnn.io/index/fearandgreed/graphdata",
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
            timeout=8,
        )
        resp.raise_for_status()
        raw = resp.json()["fear_and_greed"]
        value = float(raw["score"])
        classification = raw["rating"]
    except Exception as e:
        logger.warning(f"공포/탐욕 지수 갱신 실패: {e}")
        if row:
            return {
                "indicator": "fear_and_greed",
                "value": row.value,
                "classification": row.classification,
                "cached_at": row.cached_at,
                "source": "cache_stale",
            }
        raise HTTPException(status_code=502, detail="시장 심리 지수를 가져올 수 없습니다.")

    if row:
        row.value = value
        row.classification = classification
        row.cached_at = now
    else:
        row = MarketSentimentCache(
            indicator_name="fear_and_greed",
            value=value,
            classification=classification,
            cached_at=now,
        )
        db.add(row)
    db.commit()

    return {
        "indicator": "fear_and_greed",
        "value": value,
        "classification": classification,
        "cached_at": now,
        "source": "live",
    }


# ─────────────────────────────────────────────
# 헬스 체크
# ─────────────────────────────────────────────

@app.get("/health", tags=["시스템"])
def health():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)