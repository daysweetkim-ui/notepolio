"""
scheduler.py
Notefolio 배치 스케줄러

담당 작업:
  1. [주가 캐시]    장중 5분 / 장외 1시간 간격으로 보유 종목 시세 일괄 갱신
  2. [메타 갱신]    주 1회 섹터·발행주식수 등 StockMeta 정보 동기화
  3. [심리 지수]    1시간마다 공포/탐욕 지수(alternative.me) 갱신

실행 방법 (독립 프로세스):
    python scheduler.py

또는 main.py lifespan에 통합:
    from scheduler import start_scheduler, stop_scheduler

    @asynccontextmanager
    async def lifespan(app):
        init_db()
        start_scheduler()
        yield
        stop_scheduler()
"""

import logging
import time
from datetime import datetime, timezone

import httpx
import yfinance as yf
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy.orm import Session

from database import (
    AccountHolding,
    MarketSentimentCache,
    SessionLocal,
    StockMeta,
    StockPriceCache,
)

# ─────────────────────────────────────────────
# 로거
# ─────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("notefolio.scheduler")


# ─────────────────────────────────────────────
# 헬퍼
# ─────────────────────────────────────────────

def _get_held_tickers(db: Session) -> list[str]:
    """현재 보유 중인(quantity > 0) 종목 티커 목록을 중복 없이 반환."""
    rows = (
        db.query(AccountHolding.ticker)
        .filter(AccountHolding.quantity > 0)
        .distinct()
        .all()
    )
    return [r[0] for r in rows]


def _is_us_market_open() -> bool:
    """
    미국 주식시장 개장 여부를 UTC 기준으로 간단히 판별.
    - 월~금 13:30~20:00 UTC (서머타임 적용 기간은 12:30~19:00)
    - 실제 휴장일(공휴일) 처리는 미포함 → 잘못 갱신돼도 무해하므로 허용
    """
    now = datetime.now(timezone.utc)
    if now.weekday() >= 5:          # 토·일
        return False
    hour = now.hour + now.minute / 60
    return 13.5 <= hour <= 20.0     # UTC 기준 장중 범위 (보수적으로 넓게)


# ─────────────────────────────────────────────
# Job 1: 주가 캐시 갱신
# ─────────────────────────────────────────────

def job_update_prices() -> None:
    """
    보유 종목 전체의 시세를 yfinance batch download로 한 번에 가져와 캐시 갱신.

    Rate Limit 전략:
      - yf.download() 단일 호출로 전 종목을 처리 → 개별 Ticker 호출 금지
      - threads=False로 내부 병렬 요청 차단
      - 실패한 개별 종목은 로그만 남기고 나머지는 계속 처리
    """
    db = SessionLocal()
    try:
        tickers = _get_held_tickers(db)
        if not tickers:
            logger.info("[가격갱신] 보유 종목 없음 — 건너뜀")
            return

        logger.info(f"[가격갱신] 시작 — {len(tickers)}개 종목: {tickers}")
        start = time.perf_counter()

        # ── yfinance batch download ──────────────────
        # period="2d"로 전일 종가(prev_close)까지 함께 확보
        raw = yf.download(
            tickers=tickers,
            period="2d",
            interval="1d",
            group_by="ticker",
            auto_adjust=True,
            progress=False,
            threads=False,      # Rate limit 회피 핵심
        )

        now_utc = datetime.now(timezone.utc)
        updated = 0
        skipped = 0

        for ticker in tickers:
            try:
                # 단일 종목이면 컬럼 구조가 다름 → 분기 처리
                if len(tickers) == 1:
                    closes = raw["Close"]
                else:
                    closes = raw["Close"][ticker]

                closes = closes.dropna()
                if len(closes) < 1:
                    logger.warning(f"[가격갱신] {ticker}: 데이터 없음")
                    skipped += 1
                    continue

                current_price = float(closes.iloc[-1])
                prev_close = float(closes.iloc[-2]) if len(closes) >= 2 else current_price
                change_pct = (
                    (current_price - prev_close) / prev_close * 100
                    if prev_close != 0 else 0.0
                )

                # 52주 저점 대비 등락 — fast_info에서 별도 확보
                # (download에 포함 안 되므로 캐시된 값 우선, 없으면 None 유지)
                existing = db.query(StockPriceCache).filter_by(ticker=ticker).first()
                week52_low_pct = existing.week52_low_pct if existing else None

                if existing:
                    existing.current_price = current_price
                    existing.change_pct = round(change_pct, 4)
                    existing.cached_at = now_utc
                else:
                    db.add(StockPriceCache(
                        ticker=ticker,
                        current_price=current_price,
                        change_pct=round(change_pct, 4),
                        week52_low_pct=week52_low_pct,
                        cached_at=now_utc,
                    ))

                updated += 1

            except Exception as e:
                logger.warning(f"[가격갱신] {ticker} 처리 실패: {e}")
                skipped += 1

        db.commit()
        elapsed = round(time.perf_counter() - start, 2)
        logger.info(f"[가격갱신] 완료 — 갱신 {updated}개 / 실패 {skipped}개 / {elapsed}s")

    except Exception as e:
        db.rollback()
        logger.error(f"[가격갱신] 치명적 오류: {e}", exc_info=True)
    finally:
        db.close()


# ─────────────────────────────────────────────
# Job 2: 보조 지표 갱신 (PER, PSR, EPS, 52주 저점 등)
# ─────────────────────────────────────────────

def job_update_fundamentals() -> None:
    """
    PER·PSR·EPS·52주 저점처럼 일별 변동이 적은 보조 지표를 갱신.
    개별 Ticker.fast_info + Ticker.info 혼용.
    장중에는 실행하지 않아 Rate Limit 여유를 확보.

    스케줄: 매일 장 마감 후 1회 (UTC 21:00 ≒ KST 06:00)
    """
    db = SessionLocal()
    try:
        tickers = _get_held_tickers(db)
        if not tickers:
            return

        logger.info(f"[지표갱신] 시작 — {len(tickers)}개 종목")
        now_utc = datetime.now(timezone.utc)
        updated = 0

        for i, ticker in enumerate(tickers):
            # 종목 간 1초 딜레이로 Rate Limit 분산
            if i > 0:
                time.sleep(1.2)

            try:
                info = yf.Ticker(ticker).info
                if not info:
                    continue

                current_price = info.get("currentPrice") or info.get("regularMarketPrice")
                week52_low = info.get("fiftyTwoWeekLow")
                week52_low_pct = None
                if current_price and week52_low and week52_low != 0:
                    week52_low_pct = round(
                        (current_price - week52_low) / week52_low * 100, 2
                    )

                cache = db.query(StockPriceCache).filter_by(ticker=ticker).first()
                if cache:
                    cache.market_cap = info.get("marketCap")
                    cache.shares_outstanding = info.get("sharesOutstanding")
                    cache.per = info.get("trailingPE")
                    cache.forward_per = info.get("forwardPE")
                    cache.psr = info.get("priceToSalesTrailing12Months")
                    cache.eps = info.get("trailingEps")
                    cache.week52_low_pct = week52_low_pct
                    cache.cached_at = now_utc
                else:
                    db.add(StockPriceCache(
                        ticker=ticker,
                        current_price=current_price,
                        market_cap=info.get("marketCap"),
                        shares_outstanding=info.get("sharesOutstanding"),
                        per=info.get("trailingPE"),
                        forward_per=info.get("forwardPE"),
                        psr=info.get("priceToSalesTrailing12Months"),
                        eps=info.get("trailingEps"),
                        week52_low_pct=week52_low_pct,
                        cached_at=now_utc,
                    ))

                updated += 1
                logger.debug(f"[지표갱신] {ticker} OK")

            except Exception as e:
                logger.warning(f"[지표갱신] {ticker} 실패: {e}")

        db.commit()
        logger.info(f"[지표갱신] 완료 — {updated}/{len(tickers)}개")

    except Exception as e:
        db.rollback()
        logger.error(f"[지표갱신] 치명적 오류: {e}", exc_info=True)
    finally:
        db.close()


# ─────────────────────────────────────────────
# Job 3: StockMeta 주간 동기화
# ─────────────────────────────────────────────

def job_sync_stock_meta() -> None:
    """
    섹터·업종·거래소 등 StockMeta 필드를 주 1회 동기화.
    섹터가 바뀌면 대시보드의 섹터 비중 차트에 반영됨.

    스케줄: 매주 일요일 UTC 00:00
    """
    db = SessionLocal()
    try:
        metas = db.query(StockMeta).all()
        if not metas:
            return

        logger.info(f"[메타동기화] 시작 — {len(metas)}개 종목")
        now_utc = datetime.now(timezone.utc)
        updated = 0

        for i, meta in enumerate(metas):
            if i > 0:
                time.sleep(1.5)
            try:
                info = yf.Ticker(meta.ticker).info
                if not info:
                    continue

                meta.name = info.get("longName") or info.get("shortName") or meta.name
                meta.sector = info.get("sector") or meta.sector
                meta.industry = info.get("industry") or meta.industry
                meta.exchange = info.get("exchange") or meta.exchange
                meta.last_synced_at = now_utc
                updated += 1

            except Exception as e:
                logger.warning(f"[메타동기화] {meta.ticker} 실패: {e}")

        db.commit()
        logger.info(f"[메타동기화] 완료 — {updated}/{len(metas)}개")

    except Exception as e:
        db.rollback()
        logger.error(f"[메타동기화] 치명적 오류: {e}", exc_info=True)
    finally:
        db.close()


# ─────────────────────────────────────────────
# Job 4: 공포/탐욕 지수 갱신
# ─────────────────────────────────────────────

def job_update_sentiment() -> None:
    """
    alternative.me API에서 공포/탐욕 지수를 가져와 캐시 갱신.
    스케줄: 매시간 정각
    """
    db = SessionLocal()
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
        now_utc = datetime.now(timezone.utc)

        row = (
            db.query(MarketSentimentCache)
            .filter_by(indicator_name="fear_and_greed")
            .first()
        )
        if row:
            row.value = value
            row.classification = classification
            row.cached_at = now_utc
        else:
            db.add(MarketSentimentCache(
                indicator_name="fear_and_greed",
                value=value,
                classification=classification,
                cached_at=now_utc,
            ))

        db.commit()
        logger.info(f"[심리지수] 갱신 완료 — {value} ({classification})")

    except Exception as e:
        db.rollback()
        logger.warning(f"[심리지수] 갱신 실패: {e}")
    finally:
        db.close()


# ─────────────────────────────────────────────
# 스케줄러 설정 및 제어
# ─────────────────────────────────────────────

_scheduler = BackgroundScheduler(
    timezone="UTC",
    job_defaults={
        "coalesce": True,           # 밀린 실행은 1번만 몰아서 처리
        "max_instances": 1,         # 동일 Job 중복 실행 방지
        "misfire_grace_time": 60,   # 최대 60초 지연까지 허용
    },
)


def _register_jobs() -> None:
    """
    스케줄 등록.

    [주가 갱신] 장중(UTC 13:30~20:00, 월~금) → 5분 간격
               장외                           → 1시간 간격
    [지표 갱신] 매일 장 마감 후 UTC 21:00 (1회)
    [메타 동기화] 매주 일요일 UTC 00:00
    [심리 지수] 매시간 정각
    """

    # ── 장중 주가 갱신 (5분 간격, UTC 월~금 13:30~20:00) ──
    _scheduler.add_job(
        job_update_prices,
        CronTrigger(
            day_of_week="mon-fri",
            hour="13-19",           # 13:00~19:59 UTC
            minute="*/5",
        ),
        id="prices_market_hours",
        name="[장중] 주가 5분 갱신",
        replace_existing=True,
    )

    # ── 장외 주가 갱신 (1시간 간격) ──
    # 장중 구간을 제외한 전 시간대
    # APScheduler는 "장중이 아닐 때"를 단일 cron으로 표현하기 어려우므로
    # 시간대를 두 구간으로 분리
    _scheduler.add_job(
        job_update_prices,
        CronTrigger(
            day_of_week="mon-fri",
            hour="0-12,20-23",      # 자정~12시, 20시~자정 UTC
            minute="0",
        ),
        id="prices_after_hours_weekday",
        name="[장외-평일] 주가 1시간 갱신",
        replace_existing=True,
    )
    _scheduler.add_job(
        job_update_prices,
        CronTrigger(
            day_of_week="sat,sun",
            hour="*/1",
            minute="0",
        ),
        id="prices_after_hours_weekend",
        name="[장외-주말] 주가 1시간 갱신",
        replace_existing=True,
    )

    # ── 보조 지표 갱신 (매일 UTC 21:00) ──
    _scheduler.add_job(
        job_update_fundamentals,
        CronTrigger(hour="21", minute="0"),
        id="fundamentals_daily",
        name="[일별] 보조 지표 갱신",
        replace_existing=True,
    )

    # ── StockMeta 주간 동기화 (매주 일요일 UTC 00:00) ──
    _scheduler.add_job(
        job_sync_stock_meta,
        CronTrigger(day_of_week="sun", hour="0", minute="0"),
        id="meta_weekly",
        name="[주별] 종목 메타 동기화",
        replace_existing=True,
    )

    # ── 공포/탐욕 지수 (매시간 정각) ──
    _scheduler.add_job(
        job_update_sentiment,
        CronTrigger(minute="0"),
        id="sentiment_hourly",
        name="[시간별] 공포/탐욕 지수",
        replace_existing=True,
    )


def start_scheduler() -> None:
    """스케줄러를 시작합니다. main.py lifespan 또는 독립 실행 시 호출."""
    if _scheduler.running:
        logger.warning("스케줄러가 이미 실행 중입니다.")
        return

    _register_jobs()
    _scheduler.start()

    jobs = _scheduler.get_jobs()
    logger.info(f"스케줄러 시작 — 등록된 Job {len(jobs)}개:")
    for job in jobs:
        logger.info(f"  · {job.name} | 다음 실행: {job.next_run_time}")


def stop_scheduler() -> None:
    """스케줄러를 안전하게 종료합니다."""
    if _scheduler.running:
        _scheduler.shutdown(wait=True)
        logger.info("스케줄러 종료 완료")


# ─────────────────────────────────────────────
# 독립 실행 진입점
# ─────────────────────────────────────────────

if __name__ == "__main__":
    from database import init_db

    logger.info("Notefolio 스케줄러 독립 모드로 시작...")
    init_db()

    start_scheduler()

    # 시작 직후 전체 작업을 한 번 강제 실행해 캐시를 채움
    logger.info("초기 캐시 워밍업 실행 중...")
    job_update_prices()
    job_update_sentiment()

    logger.info("스케줄러 대기 중 (Ctrl+C로 종료)")
    try:
        while True:
            time.sleep(30)
            # 30초마다 Job 상태를 한 줄로 로깅 (디버그용)
            jobs = _scheduler.get_jobs()
            logger.debug(
                "Job 현황: "
                + " | ".join(
                    f"{j.id}→{j.next_run_time.strftime('%H:%M') if j.next_run_time else 'N/A'}"
                    for j in jobs
                )
            )
    except (KeyboardInterrupt, SystemExit):
        logger.info("종료 신호 수신")
        stop_scheduler()