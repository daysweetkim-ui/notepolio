"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchAccounts, fetchTrades } from "@/lib/api"
import type { TradeOut } from "@/types"
import {
  TrendingUp, TrendingDown, SlidersHorizontal,
  ChevronDown, ChevronUp, History,
} from "lucide-react"

// ── 헬퍼 ────────────────────────────────────────────────

function fmtDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric", year: "numeric" })
}
function fmtTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
}
function fmtPrice(v: number) {
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── 매매 카드 ────────────────────────────────────────────

function TradeCard({ trade }: { trade: TradeOut }) {
  const [expanded, setExpanded] = useState(false)
  const isBuy = trade.trade_type === "BUY"
  const totalAmount = trade.quantity * trade.price

  return (
    <div className="bg-slate-800/60 rounded-2xl overflow-hidden">
      {/* 메인 행 */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {/* 매수/매도 아이콘 */}
        <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
          isBuy ? "bg-emerald-500/15" : "bg-red-500/15"
        }`}>
          {isBuy
            ? <TrendingUp size={18} className="text-emerald-400" />
            : <TrendingDown size={18} className="text-red-400" />
          }
        </div>

        {/* 종목 + 날짜 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm">{trade.ticker}</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              isBuy
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-red-500/15 text-red-400"
            }`}>
              {isBuy ? "매수" : "매도"}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {fmtDate(trade.traded_at)} · {fmtTime(trade.traded_at)}
          </p>
        </div>

        {/* 금액 + 손익 */}
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold">{fmtPrice(totalAmount)}</p>
          {trade.realized_pnl != null && (
            <p className={`text-xs font-medium mt-0.5 ${
              trade.realized_pnl >= 0 ? "text-emerald-400" : "text-red-400"
            }`}>
              {trade.realized_pnl >= 0 ? "+" : ""}{fmtPrice(trade.realized_pnl)}
            </p>
          )}
        </div>

        {/* 펼치기 화살표 */}
        <div className="text-slate-600 ml-1">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>

      {/* 펼침 상세 */}
      {expanded && (
        <div className="border-t border-slate-700/50 px-4 py-3 space-y-3">
          {/* 수량 / 단가 / 총금액 */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "수량",   value: `${trade.quantity}주` },
              { label: "단가",   value: fmtPrice(trade.price) },
              { label: "총금액", value: fmtPrice(totalAmount) },
            ].map((item) => (
              <div key={item.label} className="bg-slate-700/40 rounded-xl px-3 py-2 text-center">
                <p className="text-[10px] text-slate-500 mb-0.5">{item.label}</p>
                <p className="text-xs font-medium">{item.value}</p>
              </div>
            ))}
          </div>

          {/* 실현손익 (매도만) */}
          {trade.realized_pnl != null && (
            <div className={`rounded-xl px-4 py-2.5 flex items-center justify-between ${
              trade.realized_pnl >= 0
                ? "bg-emerald-500/10 border border-emerald-500/20"
                : "bg-red-500/10 border border-red-500/20"
            }`}>
              <span className="text-xs text-slate-400">실현 손익</span>
              <span className={`text-sm font-bold ${
                trade.realized_pnl >= 0 ? "text-emerald-400" : "text-red-400"
              }`}>
                {trade.realized_pnl >= 0 ? "+" : ""}{fmtPrice(trade.realized_pnl)}
              </span>
            </div>
          )}

          {/* 태그 */}
          {trade.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {trade.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs bg-violet-500/15 text-violet-300 px-2.5 py-1 rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* 메모 */}
          {trade.memo && (
            <p className="text-xs text-slate-400 bg-slate-700/30 rounded-xl px-3 py-2.5 leading-relaxed">
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
    <div>
      <div className="flex items-center gap-3 mb-2">
        <span className="text-xs font-semibold text-slate-500">{date}</span>
        <div className="flex-1 h-px bg-slate-800" />
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

// ── 메인 페이지 ──────────────────────────────────────────

export default function TradesPage() {
  const [filterAccountId, setFilterAccountId] = useState<number | null>(null)
  const [filterType, setFilterType] = useState<"ALL" | "BUY" | "SELL">("ALL")
  const [showFilter, setShowFilter] = useState(false)
  const [page, setPage] = useState(0)
  const LIMIT = 30

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: fetchAccounts,
  })

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
    <main className="max-w-2xl mx-auto px-4 py-8">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold">매매 히스토리</h1>
        <button
          onClick={() => setShowFilter(!showFilter)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-sm transition-colors ${
            showFilter || filterAccountId || filterType !== "ALL"
              ? "bg-violet-500 text-white"
              : "bg-slate-800 text-slate-400 hover:text-slate-200"
          }`}
        >
          <SlidersHorizontal size={14} />
          필터
        </button>
      </div>

      {/* 필터 패널 */}
      {showFilter && (
        <div className="bg-slate-800/60 rounded-2xl p-4 mb-5 space-y-3">
          {/* 매수/매도 필터 */}
          <div>
            <p className="text-xs text-slate-500 mb-2">거래 유형</p>
            <div className="flex gap-2">
              {(["ALL", "BUY", "SELL"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => { setFilterType(type); setPage(0) }}
                  className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    filterType === type
                      ? type === "BUY"
                        ? "bg-emerald-500 text-white"
                        : type === "SELL"
                        ? "bg-red-500 text-white"
                        : "bg-violet-500 text-white"
                      : "bg-slate-700 text-slate-400"
                  }`}
                >
                  {type === "ALL" ? "전체" : type === "BUY" ? "매수" : "매도"}
                </button>
              ))}
            </div>
          </div>

          {/* 계좌 필터 */}
          <div>
            <p className="text-xs text-slate-500 mb-2">계좌</p>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => { setFilterAccountId(null); setPage(0) }}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  filterAccountId === null
                    ? "bg-violet-500 text-white"
                    : "bg-slate-700 text-slate-400"
                }`}
              >
                전체
              </button>
              {accounts.map((acc) => (
                <button
                  key={acc.id}
                  onClick={() => { setFilterAccountId(acc.id); setPage(0) }}
                  className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    filterAccountId === acc.id
                      ? "bg-violet-500 text-white"
                      : "bg-slate-700 text-slate-400"
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
        <div className="flex items-center justify-between bg-slate-800/40 rounded-xl px-4 py-2.5 mb-5">
          <span className="text-xs text-slate-500">총 {total}건</span>
          {totalPnl !== 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500">실현손익</span>
              <span className={`text-xs font-bold ${totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {totalPnl >= 0 ? "+" : ""}{fmtPrice(totalPnl)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* 피드 */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-slate-800/40 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : trades.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-500">
          <History size={40} className="mb-3 opacity-30" />
          <p className="text-sm">매매 기록이 없습니다</p>
          <p className="text-xs text-slate-600 mt-1">내 주식현황에서 종목을 탭해 기록하세요</p>
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([date, items]) => (
            <DateGroup key={date} date={date}>
              {items.map((trade) => (
                <TradeCard key={trade.id} trade={trade} />
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
            className="px-4 py-2 bg-slate-800 rounded-xl text-sm disabled:opacity-30 hover:bg-slate-700 transition-colors"
          >
            이전
          </button>
          <span className="text-xs text-slate-500">
            {page + 1} / {Math.ceil(total / LIMIT)}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={(page + 1) * LIMIT >= total}
            className="px-4 py-2 bg-slate-800 rounded-xl text-sm disabled:opacity-30 hover:bg-slate-700 transition-colors"
          >
            다음
          </button>
        </div>
      )}
    </main>
  )
}
