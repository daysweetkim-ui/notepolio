"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchAccounts, fetchTrades, fetchPortfolioSummary } from "@/lib/api"
import type { TradeOut } from "@/types"
import {
  TrendingUp, TrendingDown, SlidersHorizontal,
  ChevronDown, ChevronUp, History, Banknote, DollarSign
} from "lucide-react"

// ── 헬퍼 ────────────────────────────────────────────────

function fmtDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" })
}
function fmtTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
}

// 💡 달러 기호($) 하드코딩 해결 및 환율/통화 설정 연동
function fmtPrice(v: number, displayCurrency: "KRW" | "USD", exchangeRate = 1400) {
  if (displayCurrency === "KRW") return "₩" + Math.round(v).toLocaleString("ko-KR")
  return "$" + (v / exchangeRate).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── 매매 카드 ────────────────────────────────────────────

function TradeCard({ trade, displayCurrency, exchangeRate }: { trade: TradeOut, displayCurrency: "KRW" | "USD", exchangeRate: number }) {
  const [expanded, setExpanded] = useState(false)
  const isBuy = trade.trade_type === "BUY"
  const totalAmount = trade.quantity * trade.price

  return (
    // 💡 다크 테마 배경(bg-slate-800)을 화이트 테마(bg-white)로 깔끔하게 통일
    <div className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden mb-3">
      {/* 메인 행 */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 overflow-hidden flex-1">
          {/* 매수/매도 아이콘 */}
          <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
            isBuy ? "bg-emerald-50" : "bg-red-50"
          }`}>
            {isBuy
              ? <TrendingUp size={18} className="text-emerald-500" />
              : <TrendingDown size={18} className="text-red-500" />
            }
          </div>

          {/* 종목 + 날짜 */}
          <div className="flex-1 min-w-0 pr-2">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-slate-900 truncate">{trade.ticker}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0 ${
                isBuy
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-red-50 text-red-600"
              }`}>
                {isBuy ? "매수" : "매도"}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
              {fmtDate(trade.traded_at)} · {fmtTime(trade.traded_at)}
            </p>
          </div>
        </div>

        {/* 금액 + 손익 */}
        <div className="text-right shrink-0 flex items-center gap-2">
          <div>
            <p className="text-sm font-black text-slate-900 truncate max-w-[90px]">
              {fmtPrice(totalAmount, displayCurrency, exchangeRate)}
            </p>
            {trade.realized_pnl != null && (
              <p className={`text-[10px] font-bold mt-0.5 truncate max-w-[90px] ${
                trade.realized_pnl >= 0 ? "text-emerald-600" : "text-red-500"
              }`}>
                {trade.realized_pnl >= 0 ? "+" : ""}{fmtPrice(trade.realized_pnl, displayCurrency, exchangeRate)}
              </p>
            )}
          </div>
          <div className="text-slate-400">
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>
      </div>

      {/* 펼침 상세 */}
      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-3 space-y-3">
          {/* 수량 / 단가 / 총금액 */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "수량", value: `${trade.quantity}주` },
              { label: "단가", value: fmtPrice(trade.price, displayCurrency, exchangeRate) },
              { label: "총금액", value: fmtPrice(totalAmount, displayCurrency, exchangeRate) },
            ].map((item) => (
              <div key={item.label} className="bg-white border border-slate-100 rounded-xl px-2 py-2 text-center overflow-hidden">
                <p className="text-[10px] font-bold text-slate-400 mb-0.5 truncate">{item.label}</p>
                <p className="text-[11px] font-black text-slate-800 truncate">{item.value}</p>
              </div>
            ))}
          </div>

          {/* 실현손익 (매도만) */}
          {trade.realized_pnl != null && (
            <div className={`rounded-xl px-4 py-2.5 flex items-center justify-between border ${
              trade.realized_pnl >= 0
                ? "bg-emerald-50 border-emerald-100"
                : "bg-red-50 border-red-100"
            }`}>
              <span className="text-[11px] font-bold text-slate-500">실현 손익</span>
              <span className={`text-xs font-black truncate ${
                trade.realized_pnl >= 0 ? "text-emerald-600" : "text-red-600"
              }`}>
                {trade.realized_pnl >= 0 ? "+" : ""}{fmtPrice(trade.realized_pnl, displayCurrency, exchangeRate)}
              </span>
            </div>
          )}

          {/* 태그 */}
          {trade.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {trade.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] bg-violet-50 text-violet-600 border border-violet-100 px-2 py-1 rounded-md font-bold"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* 메모 */}
          {trade.memo && (
            <p className="text-[11px] text-slate-600 bg-white border border-slate-200 rounded-xl px-3 py-2 leading-relaxed mt-2">
              📝 {trade.memo}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── 날짜별 그룹 헤더 ──────────────────────────────────────

function DateGroup({ date, children }: { date: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-[11px] font-black text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg">{date}</span>
        <div className="flex-1 h-px bg-slate-100" />
      </div>
      <div>{children}</div>
    </div>
  )
}

// ── 메인 페이지 ──────────────────────────────────────────

export default function TradesPage() {
  const [filterAccountId, setFilterAccountId] = useState<number | null>(null)
  const [filterType, setFilterType] = useState<"ALL" | "BUY" | "SELL">("ALL")
  const [showFilter, setShowFilter] = useState(false)
  const [displayCurrency, setDisplayCurrency] = useState<"KRW" | "USD">("KRW")
  const [page, setPage] = useState(0)
  const LIMIT = 30

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: fetchAccounts,
  })

  // 💡 원화/달러 변환을 위해 환율 정보를 가져옵니다.
  const { data: summary } = useQuery<any>({ 
    queryKey: ["portfolio-summary", null], 
    queryFn: () => fetchPortfolioSummary(null) 
  })
  const exchangeRate = summary?.exchange_rate ?? 1400

  const { data, isLoading } = useQuery({
    queryKey: ["trades", filterAccountId, filterType, page],
    queryFn: () =>
      fetchTrades({
        accountId: filterAccountId,
        tradeType: filterType === "ALL" ? null : filterType,
        limit: LIMIT,
        offset: page * LIMIT,
      }),
  })

  const trades: TradeOut[] = data?.items ?? []
  const total: number = data?.total ?? 0

  // 날짜별 그룹핑
  const grouped = trades.reduce<Record<string, TradeOut[]>>((acc, trade) => {
    const date = fmtDate(trade.traded_at)
    if (!acc[date]) acc[date] = []
    acc[date].push(trade)
    return acc
  }, {})

  // 실현손익 합계
  const totalPnl = trades
    .filter((t) => t.realized_pnl != null)
    .reduce((sum, t) => sum + (t.realized_pnl ?? 0), 0)

  return (
    // 💡 가로 사이즈(max-w-lg) 통일 및 하단바 짤림 방지 여백(pb-24) 추가
    <main className="max-w-lg mx-auto px-4 pt-6 pb-24">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-slate-800 tracking-tight">매매 히스토리</h1>
        <div className="flex gap-2">
          {/* 💡 원화 달러 토글 버튼 추가 */}
          <button
            onClick={() => setDisplayCurrency(displayCurrency === "KRW" ? "USD" : "KRW")}
            className="flex items-center gap-1 bg-white border border-slate-200 px-2.5 py-1.5 rounded-xl text-xs font-bold text-slate-500 shadow-sm shrink-0"
          >
            {displayCurrency === "KRW" ? <Banknote size={14} /> : <DollarSign size={14} />}
            <span className="hidden sm:inline">{displayCurrency === "KRW" ? "원화" : "달러"}</span>
          </button>
          <button
            onClick={() => setShowFilter(!showFilter)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              showFilter || filterAccountId || filterType !== "ALL"
                ? "bg-violet-600 text-white shadow-sm"
                : "bg-white border border-slate-200 text-slate-600 shadow-sm"
            }`}
          >
            <SlidersHorizontal size={14} /> 필터
          </button>
        </div>
      </div>

      {/* 필터 패널 */}
      {showFilter && (
        <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-4 mb-5 space-y-4">
          {/* 매수/매도 필터 */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 mb-2">거래 유형</p>
            <div className="flex gap-2">
              {(["ALL", "BUY", "SELL"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => { setFilterType(type); setPage(0) }}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${
                    filterType === type
                      ? "bg-violet-600 text-white"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {type === "ALL" ? "전체" : type === "BUY" ? "매수" : "매도"}
                </button>
              ))}
            </div>
          </div>

          {/* 계좌 필터 */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 mb-2">계좌</p>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => { setFilterAccountId(null); setPage(0) }}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${
                  filterAccountId === null
                    ? "bg-violet-600 text-white"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                전체
              </button>
              {accounts.map((acc) => (
                <button
                  key={acc.id}
                  onClick={() => { setFilterAccountId(acc.id); setPage(0) }}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${
                    filterAccountId === acc.id
                      ? "bg-violet-600 text-white"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {acc.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 요약 바 */}
      {trades.length > 0 && (
        <div className="flex items-center justify-between bg-white border border-slate-200 shadow-sm rounded-xl px-4 py-3 mb-5">
          <span className="text-xs font-bold text-slate-500">총 {total}건</span>
          {totalPnl !== 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-slate-400">실현손익 합계</span>
              <span className={`text-xs font-black ${totalPnl >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {totalPnl >= 0 ? "+" : ""}{fmtPrice(totalPnl, displayCurrency, exchangeRate)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* 피드 */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-white border border-slate-100 rounded-2xl animate-pulse shadow-sm" />
          ))}
        </div>
      ) : trades.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-slate-50 rounded-3xl border border-dashed border-slate-200 mt-4">
          <History size={36} className="mb-3 text-slate-300" />
          <p className="text-sm font-bold text-slate-500">매매 기록이 없습니다</p>
          <p className="text-[10px] text-slate-400 mt-1">내 주식현황에서 종목을 탭해 기록하세요</p>
        </div>
      ) : (
        <div>
          {Object.entries(grouped).map(([date, items]) => (
            <DateGroup key={date} date={date}>
              {items.map((trade) => (
                <TradeCard key={trade.id} trade={trade} displayCurrency={displayCurrency} exchangeRate={exchangeRate} />
              ))}
            </DateGroup>
          ))}
        </div>
      )}

      {/* 페이지네이션 */}
      {total > LIMIT && (
        <div className="flex items-center justify-center gap-3 mt-8">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-4 py-2 bg-white border border-slate-200 shadow-sm rounded-xl text-xs font-bold disabled:opacity-40 hover:bg-slate-50 text-slate-600 transition-colors"
          >
            이전
          </button>
          <span className="text-xs font-bold text-slate-400">
            {page + 1} / {Math.ceil(total / LIMIT)}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={(page + 1) * LIMIT >= total}
            className="px-4 py-2 bg-white border border-slate-200 shadow-sm rounded-xl text-xs font-bold disabled:opacity-40 hover:bg-slate-50 text-slate-600 transition-colors"
          >
            다음
          </button>
        </div>
      )}
    </main>
  )
}