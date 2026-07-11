"""
database.py
Notefolio 데이터베이스 설정 및 ORM 모델 정의
- SQLite + WAL 모드 (배치 쓰기 / API 읽기 동시성 보장)
- SQLAlchemy 2.x 방식 (DeclarativeBase)
"""

from datetime import datetime
from typing import Generator

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    String,
    Text,
    create_engine,
    event,
    func,
    Integer,
)
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    Session,
    mapped_column,
    relationship,
    sessionmaker,
)

# ─────────────────────────────────────────────
# 엔진 설정
# ─────────────────────────────────────────────

DATABASE_URL = "sqlite:///notefolioreal.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    # SQLite는 기본적으로 connection pool을 쓰지 않으므로
    # StaticPool을 쓰거나 pool_pre_ping만 켜두면 충분
    pool_pre_ping=True,
    echo=False,  # 쿼리 로깅: 개발 중엔 True로 변경
)


@event.listens_for(engine, "connect")
def set_sqlite_pragmas(dbapi_conn, _):
    """
    WAL 모드   : 배치 스케줄러(쓰기)와 API(읽기)의 동시 접근 허용
    synchronous: NORMAL → 성능/안전성 균형 (FULL보다 빠르고 OFF보다 안전)
    foreign_keys: SQLite는 기본 비활성 → 명시적으로 켜줘야 FK 제약이 동작
    """
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA cache_size=-64000")   # 64MB 메모리 캐시
    cursor.execute("PRAGMA temp_store=MEMORY")
    cursor.close()


SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,  # 커밋 후 객체 재조회 없이 바로 반환
)

# ─────────────────────────────────────────────
# Base 클래스
# ─────────────────────────────────────────────

class Base(DeclarativeBase):
    pass

# ─────────────────────────────────────────────
# User
# ─────────────────────────────────────────────

class User(Base):
    """
    유저 테이블
    초대 코드로 접근. 코드는 관리자가 직접 생성.
    """
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)           # 표시 이름 (예: "홍길동")
    invite_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)  # 초대 코드
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

# ─────────────────────────────────────────────
# 테이블 모델
# ─────────────────────────────────────────────

class Account(Base):
    """
    계좌 테이블
    예: 미국주식 계좌, 연금계좌, ISA 등
    """
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False) # 유저ID
    name: Mapped[str] = mapped_column(String(100), nullable=False)           # 계좌 이름 (표시용)
    account_type: Mapped[str] = mapped_column(String(50), nullable=False)    # 예: "주식", "연금", "ISA"
    currency: Mapped[str] = mapped_column(String(10), default="USD")         # 기준 통화
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=func.now(), nullable=False
    )

    # relationships
    holdings: Mapped[list["AccountHolding"]] = relationship(
        "AccountHolding", back_populates="account", cascade="all, delete-orphan"
    )
    trades: Mapped[list["Trade"]] = relationship(
        "Trade", back_populates="account", cascade="all, delete-orphan"
    )
    cash_balance: Mapped["CashBalance | None"] = relationship(
        "CashBalance", back_populates="account", uselist=False, cascade="all, delete-orphan"
    )


class StockMeta(Base):
    """
    종목 기본 정보 (섹터, 거래소 등 잘 바뀌지 않는 정보)
    ticker를 PK로 사용. 최초 등록 시 yfinance에서 1회 가져와 영구 저장.
    """
    __tablename__ = "stock_meta"

    ticker: Mapped[str] = mapped_column(String(20), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)           # 종목 풀네임
    sector: Mapped[str | None] = mapped_column(String(100), nullable=True)
    industry: Mapped[str | None] = mapped_column(String(100), nullable=True)
    exchange: Mapped[str | None] = mapped_column(String(50), nullable=True)  # NASDAQ, NYSE ...
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # relationships
    holdings: Mapped[list["AccountHolding"]] = relationship(
        "AccountHolding", back_populates="stock_meta"
    )
    price_cache: Mapped["StockPriceCache | None"] = relationship(
        "StockPriceCache", back_populates="stock_meta",
        uselist=False, cascade="all, delete-orphan"
    )


class StockPriceCache(Base):
    """
    실시간 시세 캐시 (APScheduler가 5분 간격으로 갱신)
    종목당 row 1개. upsert(merge) 방식으로 업데이트.
    """
    __tablename__ = "stock_price_cache"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticker: Mapped[str] = mapped_column(
        String(20), ForeignKey("stock_meta.ticker", ondelete="CASCADE"),
        nullable=False, unique=True
    )
    current_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    change_pct: Mapped[float | None] = mapped_column(Float, nullable=True)       # 전일 대비 등락률 (%)
    market_cap: Mapped[float | None] = mapped_column(Float, nullable=True)
    shares_outstanding: Mapped[float | None] = mapped_column(Float, nullable=True)
    per: Mapped[float | None] = mapped_column(Float, nullable=True)              # Trailing P/E
    forward_per: Mapped[float | None] = mapped_column(Float, nullable=True)
    psr: Mapped[float | None] = mapped_column(Float, nullable=True)              # Price/Sales
    eps: Mapped[float | None] = mapped_column(Float, nullable=True)
    week52_low_pct: Mapped[float | None] = mapped_column(Float, nullable=True)   # 52주 저점 대비 상승률 (%)
    cached_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # relationship
    stock_meta: Mapped["StockMeta"] = relationship(
        "StockMeta", back_populates="price_cache"
    )


class AccountHolding(Base):
    """
    계좌별 종목 포지션 (Account × StockMeta 의 교차 테이블)
    동일 종목(AAPL)이 계좌 A / 계좌 B에 각각 다른 avg_price, quantity로 존재 가능.
    """
    __tablename__ = "account_holdings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False) # 유저ID
    account_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False
    )
    ticker: Mapped[str] = mapped_column(
        String(20), ForeignKey("stock_meta.ticker", ondelete="RESTRICT"), nullable=False
    )
    avg_price: Mapped[float] = mapped_column(Float, nullable=False)              # 가중평균 매입단가
    quantity: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)  # 소수점 허용 (ETF 등)
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)                # 매수 사유 메모
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=func.now(), onupdate=func.now()
    )

    # relationships
    account: Mapped["Account"] = relationship("Account", back_populates="holdings")
    stock_meta: Mapped["StockMeta"] = relationship("StockMeta", back_populates="holdings")
    trades: Mapped[list["Trade"]] = relationship(
        "Trade", back_populates="holding", cascade="all, delete-orphan"
    )


class Trade(Base):
    """
    매매 기록 테이블 (매수 / 매도 히스토리)
    - holding_id: 어느 포지션에 귀속되는 거래인지
    - account_id: 필터링 편의를 위해 비정규화하여 중복 저장
    - realized_pnl: 매도 시 서버에서 계산 후 저장 (매수는 NULL)
    """
    __tablename__ = "trades"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False) # 유저ID
    holding_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("account_holdings.id", ondelete="CASCADE"), nullable=False
    )
    account_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False
    )
    ticker: Mapped[str] = mapped_column(String(20), nullable=False)              # 비정규화 (조회 편의)
    trade_type: Mapped[str] = mapped_column(String(4), nullable=False)           # "BUY" | "SELL"
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    price: Mapped[float] = mapped_column(Float, nullable=False)                  # 거래 단가
    realized_pnl: Mapped[float | None] = mapped_column(Float, nullable=True)     # 매도 시에만 존재
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[str | None] = mapped_column(Text, nullable=True)                # JSON 문자열 ["분할매수", "장기"]
    traded_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)        # 유저가 입력한 매매 시각
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    # relationships
    holding: Mapped["AccountHolding"] = relationship(
        "AccountHolding", back_populates="trades"
    )
    account: Mapped["Account"] = relationship("Account", back_populates="trades")


class CashBalance(Base):
    """
    계좌별 현금 잔고
    대시보드의 '현금 비중' 계산에 사용.
    계좌당 row 1개 (upsert 방식).
    """
    __tablename__ = "cash_balances"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False) # 유저ID
    account_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False, unique=True
    )
    amount: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    currency: Mapped[str] = mapped_column(String(10), default="USD")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=func.now(), onupdate=func.now()
    )

    # relationship
    account: Mapped["Account"] = relationship("Account", back_populates="cash_balance")


class MarketSentimentCache(Base):
    """
    시장 심리 지수 캐시 (공포/탐욕 지수 등)
    indicator_name을 키로 upsert. 스케줄러가 1시간마다 갱신.
    """
    __tablename__ = "market_sentiment_cache"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    indicator_name: Mapped[str] = mapped_column(
        String(100), nullable=False, unique=True
    )                                                                            # 예: "fear_and_greed"
    value: Mapped[float | None] = mapped_column(Float, nullable=True)            # 0~100
    classification: Mapped[str | None] = mapped_column(String(50), nullable=True) # "Extreme Fear" 등
    cached_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


# ─────────────────────────────────────────────
# [NEW] 신규 테이블: 포트폴리오 스냅샷
# ─────────────────────────────────────────────
class PortfolioSnapshot(Base):
    """
    포트폴리오 스냅샷 (결산 기록용)
    """
    __tablename__ = "portfolio_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    total_asset: Mapped[float] = mapped_column(Float, nullable=False)       # 총 자산
    total_stock_buy: Mapped[float] = mapped_column(Float, nullable=False)   # 매입금 총액
    total_stock_eval: Mapped[float] = mapped_column(Float, nullable=False)  # 평가금 총액
    total_cash: Mapped[float] = mapped_column(Float, nullable=False)        # 현금 잔고
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)           # 메모
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    # relationship
    user: Mapped["User"] = relationship("User")


# ─────────────────────────────────────────────
# [NEW] 신규 테이블: 타임라인 이벤트
# ─────────────────────────────────────────────
class TimelineEvent(Base):
    """
    타임라인 이벤트 (수동 메모 + 관심종목 실적일 등)
    """
    __tablename__ = "timeline_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    event_type: Mapped[str] = mapped_column(String(20), nullable=False)     # EARNING, MACRO, CUSTOM
    ticker: Mapped[str | None] = mapped_column(String(20), nullable=True)   # 관련 티커
    title: Mapped[str] = mapped_column(String(100), nullable=False)         # 일정 제목
    event_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)  # 이벤트 날짜
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)           # 메모
    link: Mapped[str | None] = mapped_column(Text, nullable=True)           # 외부 링크
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    # relationship
    user: Mapped["User"] = relationship("User")


# ─────────────────────────────────────────────
# 유틸리티
# ─────────────────────────────────────────────

def init_db() -> None:
    """
    앱 시작 시 호출. 테이블이 없으면 생성, 있으면 건드리지 않음.
    (마이그레이션이 필요해지면 Alembic 도입 검토)
    """
    Base.metadata.create_all(bind=engine)


def get_db() -> Generator[Session, None, None]:
    """
    FastAPI Depends용 DB 세션 제공자.
    요청 단위로 세션을 열고, 완료/오류 시 반드시 닫음.

    사용 예:
        @router.get("/accounts")
        def list_accounts(db: Session = Depends(get_db)):
            return db.query(Account).all()
    """
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()