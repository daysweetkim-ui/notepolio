"""
main.py
Notefolio FastAPI 애플리케이션 진입점 및 전체 라우터 정의

엔드포인트 목록:
  [계좌]        GET/POST   /api/accounts
                GET/PUT    /api/accounts/{account_id}
                PUT        /api/accounts/{account_id}/cash
  [포트폴리오]  GET        /api/portfolio/summary
  [종목 검색]   GET        /api/stocks/search
  [보유 종목]   GET/POST   /api/holdings
                GET/PUT/DELETE /api/holdings/{holding_id}
  [매매 기록]   GET/POST   /api/trades
                GET/DELETE /api/trades/{trade_id}
  [시장 심리]   GET        /api/market/sentiment
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Next.js dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────
# Pydantic 스키마
# ─────────────────────────────────────────────

# ── 인증 ──────────────────────────────────────────────────

class InviteCodeRequest(BaseModel):
    invite_code: str

@app.post("/api/auth/login", tags=["인증"])
def login_with_invite_code(body: InviteCodeRequest, db: Session = Depends(get_db)):
    """초대 코드로 로그인. JWT 토큰을 반환합니다."""
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
    """현재 로그인된 유저 정보 반환."""
    return {"id": current_user.id, "name": current_user.name}

# ── 계좌 ──────────────────────────────────────

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


# ── 보유 종목 ─────────────────────────────────

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
    # 종목 메타
    name: str | None = None
    sector: str | None = None
    industry: str | None = None
    exchange: str | None = None
    # 실시간 시세 (캐시)
    price_info: PriceInfo | None = None

    class Config:
        from_attributes = True


# ── 매매 기록 ─────────────────────────────────

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
# 내부 헬퍼
# ─────────────────────────────────────────────

def _fetch_and_save_stock_meta(ticker: str, db: Session) -> StockMeta:
    """
    yfinance에서 종목 기본 정보를 가져와 stock_meta / stock_price_cache에 저장.
    이미 존재하면 반환만 한다.
    """
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

    # 최초 시세도 함께 저장
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


def _holding_to_out(h: AccountHolding) -> dict[str, Any]:
    """AccountHolding ORM → HoldingOut 딕셔너리"""
    price_info = None
    if h.stock_meta and h.stock_meta.price_cache:
        pc = h.stock_meta.price_cache
        price_info = PriceInfo(
            current_price=pc.current_price,
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
def list_accounts(db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),  # ← 추가
):
    """등록된 모든 계좌 목록과 현금 잔고를 반환합니다."""
    accounts = (
        db.query(Account)
        .options(joinedload(Account.cash_balance))
        .filter(Account.is_active == True)
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
def create_account(body: AccountCreate, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),  # ← 추가
):
    """새 계좌를 등록합니다. 생성과 동시에 현금 잔고 row(0원)도 함께 생성됩니다."""
    acc = Account(**body.model_dump())
    db.add(acc)
    db.flush()  # id 확보

    cash = CashBalance(account_id=acc.id, amount=0.0, currency=body.currency)
    db.add(cash)
    db.commit()
    db.refresh(acc)

    return AccountOut(
        id=acc.id,
        name=acc.name,
        account_type=acc.account_type,
        currency=acc.currency,
        description=acc.description,
        is_active=acc.is_active,
        created_at=acc.created_at,
        cash_amount=0.0,
    )


@app.get("/api/accounts/{account_id}", response_model=AccountOut, tags=["계좌"])
def get_account(account_id: int, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),  # ← 추가
):
    acc = db.query(Account).options(joinedload(Account.cash_balance)).get(account_id)
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
def update_account(account_id: int, body: AccountUpdate, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),  # ← 추가
):
    """계좌 이름, 설명, 활성 상태를 수정합니다."""
    acc = db.get(Account, account_id)
    if not acc:
        raise HTTPException(status_code=404, detail="계좌를 찾을 수 없습니다.")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(acc, field, value)

    db.commit()
    db.refresh(acc)
    cash = acc.cash_balance.amount if acc.cash_balance else 0.0
    return AccountOut(
        id=acc.id,
        name=acc.name,
        account_type=acc.account_type,
        currency=acc.currency,
        description=acc.description,
        is_active=acc.is_active,
        created_at=acc.created_at,
        cash_amount=cash,
    )

@app.delete("/api/accounts/{account_id}", status_code=204, tags=["계좌"])
def delete_account(account_id: int, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),  # ← 추가
):
    """계좌를 삭제합니다. 연관된 보유 종목과 매매 기록도 함께 삭제됩니다."""
    acc = db.get(Account, account_id)
    if not acc:
        raise HTTPException(status_code=404, detail="계좌를 찾을 수 없습니다.")
    db.delete(acc)
    db.commit()

@app.put("/api/accounts/{account_id}/cash", tags=["계좌"])
def update_cash(account_id: int, body: CashUpdate, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),  # ← 추가
):
    """계좌의 현금 잔고를 업데이트합니다 (직접 입력 방식)."""
    acc = db.get(Account, account_id)
    if not acc:
        raise HTTPException(status_code=404, detail="계좌를 찾을 수 없습니다.")

    cash = db.query(CashBalance).filter_by(account_id=account_id).first()
    if cash:
        cash.amount = body.amount
        cash.currency = body.currency
    else:
        cash = CashBalance(account_id=account_id, amount=body.amount, currency=body.currency)
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
    # 환율 가져오기 (USD 기준)
    def get_exchange_rate(currency: str) -> float:
        if currency == "USD":
            return 1.0
        try:
            ticker = yf.Ticker(f"USD{currency}=X")
            rate = ticker.fast_info.get("lastPrice")
            return float(rate) if rate else 1.0
        except:
            return 1.0

    # 계좌 목록
    accounts = db.query(Account).filter(Account.is_active == True).all()
    account_map = {a.id: a for a in accounts}

    # 환율 캐시 (같은 통화 중복 호출 방지)
    rate_cache: dict[str, float] = {}
    def to_usd(amount: float, currency: str) -> float:
        if currency == "USD":
            return amount
        if currency not in rate_cache:
            rate_cache[currency] = get_exchange_rate(currency)
        return amount / rate_cache[currency]

    # 보유 종목 쿼리
    q = db.query(AccountHolding).options(
        joinedload(AccountHolding.stock_meta).joinedload(StockMeta.price_cache)
    )
    if account_id:
        q = q.filter(AccountHolding.account_id == account_id)
    holdings = q.all()

    # 현금 쿼리
    cash_q = db.query(CashBalance)
    if account_id:
        cash_q = cash_q.filter(CashBalance.account_id == account_id)
    cash_rows = cash_q.all()

    total_cash_usd = sum(
        to_usd(c.amount, account_map[c.account_id].currency)
        for c in cash_rows
        if c.account_id in account_map
    )

    # 종목별 평가액 (USD 기준 통일)
    ticker_map: dict[str, dict] = {}
    sector_map: dict[str, float] = {}
    account_stock_map: dict[str, float] = {}  # 계좌별 주식 평가액
    total_stock_value_usd = 0.0

    for h in holdings:
        pc = h.stock_meta.price_cache if h.stock_meta else None
        price = pc.current_price if pc and pc.current_price else h.avg_price
        acc = account_map.get(h.account_id)
        acc_currency = acc.currency if acc else "USD"
        value_usd = to_usd(price * h.quantity, acc_currency)
        total_stock_value_usd += value_usd

        # 종목별
        ticker = h.ticker
        if ticker not in ticker_map:
            ticker_map[ticker] = {"ticker": ticker, "name": h.stock_meta.name if h.stock_meta else ticker, "value": 0.0}
        ticker_map[ticker]["value"] += value_usd

        # 섹터별
        sector = (h.stock_meta.sector if h.stock_meta else None) or "기타"
        sector_map[sector] = sector_map.get(sector, 0.0) + value_usd

        # 계좌별
        acc_name = acc.name if acc else f"계좌 {h.account_id}"
        account_stock_map[acc_name] = account_stock_map.get(acc_name, 0.0) + value_usd

    # 계좌별 현금도 account_map에 합산
    account_total_map: dict[str, float] = dict(account_stock_map)
    for c in cash_rows:
        acc = account_map.get(c.account_id)
        if not acc:
            continue
        acc_name = acc.name
        val = to_usd(c.amount, acc.currency)
        account_total_map[acc_name] = account_total_map.get(acc_name, 0.0) + val

    total_asset_usd = total_stock_value_usd + total_cash_usd

    def with_pct(items: list[dict], value_key: str) -> list[dict]:
        total = sum(i[value_key] for i in items)
        for item in items:
            item["pct"] = round(item[value_key] / total * 100, 2) if total else 0.0
        return sorted(items, key=lambda x: x[value_key], reverse=True)

    ticker_weights = with_pct(list(ticker_map.values()), "value")
    sector_weights = with_pct(
        [{"sector": k, "value": v} for k, v in sector_map.items()], "value"
    )
    account_weights = with_pct(
        [{"sector": k, "value": v} for k, v in account_total_map.items()], "value"
    )

    return {
        "total_asset": round(total_asset_usd, 2),
        "total_stock_value": round(total_stock_value_usd, 2),
        "total_cash": round(total_cash_usd, 2),
        "cash_pct": round(total_cash_usd / total_asset_usd * 100, 2) if total_asset_usd else 0.0,
        "sector_weights": sector_weights,
        "ticker_weights": ticker_weights,
        "account_weights": account_weights,  # 계좌별 비중 추가
    }


# ─────────────────────────────────────────────
# 라우터: 종목 검색 (Stock Search)
# ─────────────────────────────────────────────

@app.get("/api/stocks/search", tags=["종목 검색"])
def search_stock(
    q: str = Query(..., min_length=1, description="티커 또는 종목명"),
    db: Session = Depends(get_db),
):
    """
    티커 또는 종목명으로 종목을 검색합니다.
    1. DB에 이미 있으면 즉시 반환 (yfinance 미호출)
    2. 없으면 yfinance Search로 후보 목록 반환
    """
    q_upper = q.strip().upper()

    # 1) DB 캐시 우선 조회
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

    # 2) yfinance 검색
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
    """보유 종목 목록. account_id로 필터링 가능."""
    q = db.query(AccountHolding).options(
        joinedload(AccountHolding.stock_meta).joinedload(StockMeta.price_cache)
    )
    if account_id:
        q = q.filter(AccountHolding.account_id == account_id)

    holdings = q.order_by(AccountHolding.created_at.desc()).all()
    return [_holding_to_out(h) for h in holdings]


@app.post("/api/holdings", response_model=HoldingOut, status_code=201, tags=["보유 종목"])
def create_holding(body: HoldingCreate, db: Session = Depends(get_db)):
    """
    종목을 계좌에 등록합니다.
    - StockMeta가 없으면 yfinance에서 자동으로 가져와 저장합니다.
    - 같은 계좌에 동일 티커가 이미 있으면 가중평균 단가와 수량을 업데이트합니다.
    """
    acc = db.get(Account, body.account_id)
    if not acc:
        raise HTTPException(status_code=404, detail="계좌를 찾을 수 없습니다.")

    # StockMeta 확보 (없으면 yfinance 호출)
    _fetch_and_save_stock_meta(body.ticker, db)

    # 같은 계좌 + 같은 티커 포지션이 이미 있는지 확인
    existing = (
        db.query(AccountHolding)
        .filter_by(account_id=body.account_id, ticker=body.ticker)
        .first()
    )
    if existing:
        # 가중평균 단가 업데이트
        total_cost = existing.avg_price * existing.quantity + body.avg_price * body.quantity
        existing.quantity += body.quantity
        existing.avg_price = total_cost / existing.quantity
        if body.memo:
            existing.memo = body.memo
        db.commit()
        db.refresh(existing)
        # price_cache 재로드
        existing = (
            db.query(AccountHolding)
            .options(joinedload(AccountHolding.stock_meta).joinedload(StockMeta.price_cache))
            .get(existing.id)
        )
        return _holding_to_out(existing)

    holding = AccountHolding(
        account_id=body.account_id,
        ticker=body.ticker,
        avg_price=body.avg_price,
        quantity=body.quantity,
        memo=body.memo,
    )
    db.add(holding)
    db.commit()
    db.refresh(holding)

    holding = (
        db.query(AccountHolding)
        .options(joinedload(AccountHolding.stock_meta).joinedload(StockMeta.price_cache))
        .get(holding.id)
    )
    return _holding_to_out(holding)


@app.get("/api/holdings/{holding_id}", response_model=HoldingOut, tags=["보유 종목"])
def get_holding(holding_id: int, db: Session = Depends(get_db)):
    h = (
        db.query(AccountHolding)
        .options(joinedload(AccountHolding.stock_meta).joinedload(StockMeta.price_cache))
        .get(holding_id)
    )
    if not h:
        raise HTTPException(status_code=404, detail="보유 종목을 찾을 수 없습니다.")
    return _holding_to_out(h)


@app.put("/api/holdings/{holding_id}", response_model=HoldingOut, tags=["보유 종목"])
def update_holding(holding_id: int, body: HoldingUpdate, db: Session = Depends(get_db)):
    """평균 단가, 수량, 메모를 직접 수정합니다. (매매 기록 없이 수동 보정 시 사용)"""
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
    return _holding_to_out(h)


@app.delete("/api/holdings/{holding_id}", status_code=204, tags=["보유 종목"])
def delete_holding(holding_id: int, db: Session = Depends(get_db)):
    """포지션 및 연관 매매 기록을 모두 삭제합니다."""
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
    """
    매매 히스토리 피드.
    - account_id, ticker, trade_type으로 필터링 가능
    - 최신순 정렬, 페이지네이션 지원
    """
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
def create_trade(body: TradeCreate, db: Session = Depends(get_db)):
    """
    매매를 기록합니다.

    BUY  → 포지션의 avg_price(가중평균), quantity 업데이트
    SELL → 실현 손익 자동 계산 후 저장, quantity 차감
           수량이 0이 되면 포지션은 그대로 유지 (히스토리 보존 목적)
    """
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
        # 실현 손익: (매도가 - 평균단가) × 수량
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
    """
    매매 기록을 삭제합니다.
    주의: 포지션의 avg_price / quantity는 역산하지 않습니다.
    삭제 후 포지션을 수동으로 보정하려면 PUT /api/holdings/{id}를 사용하세요.
    """
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
    """
    공포/탐욕 지수를 반환합니다.
    캐시가 1시간 이내라면 DB에서 즉시 반환.
    만료됐으면 alternative.me API를 호출해 갱신합니다.
    (실제 갱신은 scheduler.py가 담당 — 이 엔드포인트는 읽기 전용 폴백)
    """
    
    import httpx
    from datetime import timedelta

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

    # 캐시 만료 → alternative.me 호출
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

        resp = httpx.get("https://production.dataviz.cnn.io/index/fearandgreed/graphdata",
    headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
    timeout=8)
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


# ─────────────────────────────────────────────
# 로컬 실행
# ─────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)