"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchAccounts, fetchHoldings, createHolding, searchStock, createTrade, deleteHolding, updateCash } from "@/lib/api"
import type { Account, HoldingOut, StockSearchResult, HoldingCreate } from "@/types"
import {  Plus, Search, X, ChevronDown, TrendingUp, TrendingDown, Minus, MoreVertical, Trash2, Banknote } from "lucide-react"
import TradeModal from "@/components/holdings/TradeModal"
import AccountModal from "@/components/holdings/AccountModal"

// ── 숫자 포맷 헬퍼 ──────────────────────────────────────

function fmtPrice(v: number | null | undefined, curr = "USD") {
  if (v == null) return "—"
  if (curr === "KRW") {
    return "₩" + Math.round(v).toLocaleString("ko-KR")
  }
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtPct(v: number | null | undefined) {
  if (v == null) return "—"
  const sign = v >= 0 ? "+" : ""
  return sign + v.toFixed(2) + "%"
}
function fmtLarge(v: number | null | undefined) {
  if (v == null) return "—"
  if (v >= 1e12) return "$" + (v / 1e12).toFixed(2) + "T"
  if (v >= 1e9)  return "$" + (v / 1e9).toFixed(2) + "B"
  if (v >= 1e6)  return "$" + (v / 1e6).toFixed(2) + "M"
  return "$" + v.toLocaleString()
}

// ── 손익 색상 ────────────────────────────────────────────

function pnlColor(pct: number | null | undefined) {
  if (pct == null) return "text-slate-400"
  if (pct > 0) return "text-emerald-400"
  if (pct < 0) return "text-red-400"
  return "text-slate-400"
}

// ── 종목 카드 ────────────────────────────────────────────

function HoldingCard({
  holding,
  accounts,
  onTradeClick,
}: {
  holding: HoldingOut
  accounts: Account[]
  onTradeClick: (h: HoldingOut) => void
}) {
  const qc = useQueryClient()
  const [showActions, setShowActions] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const pc = holding.price_info
  const curr = accounts.find((a) => a.id === holding.account_id)?.currency ?? "USD"
  const currentPrice = pc?.current_price ?? holding.avg_price
  const evalValue = currentPrice * holding.quantity
  const pnlPct = pc?.change_pct ?? null
  const totalPnlPct =
    holding.avg_price > 0
      ? ((currentPrice - holding.avg_price) / holding.avg_price) * 100
      : null

  const { mutate: remove } = useMutation({
    mutationFn: () => deleteHolding(holding.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["holdings"] })
      qc.invalidateQueries({ queryKey: ["portfolio-summary"] })
    },
  })

  const accountName = holding.account_name ?? ""

  return (
    <div className="bg-slate-800/60 rounded-2xl p-4">
      {/* 상단: 종목명+티커 + 액션 버튼 */}
      <div className="flex items-start justify-between mb-3">
        <div
          className="flex-1 cursor-pointer"
          onClick={() => onTradeClick(holding)}
        >
          <div className="flex items-center gap-2">
            <span className="font-bold text-base tracking-wide">
              {holding.name ?? holding.ticker}
            </span>
            {pc?.change_pct != null && (
              <span className={`text-xs font-medium ${pnlColor(pc.change_pct)}`}>
                {fmtPct(pc.change_pct)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-xs text-slate-500">{holding.ticker}</p>
            {accountName && (
              <>
                <span className="text-slate-700">·</span>
                <span className="text-xs text-violet-400/80">{accountName}</span>
              </>
            )}
          </div>
          <p className="text-xs text-slate-600">{holding.sector ?? ""}</p>
        </div>

        <div className="flex items-start gap-2">
          {/* 평가금액 */}
          <div
            className="text-right cursor-pointer"
            onClick={() => onTradeClick(holding)}
          >
            <p className="font-semibold text-sm">{fmtPrice(evalValue, curr)}</p>
            <p className={`text-xs mt-0.5 font-medium ${pnlColor(totalPnlPct)}`}>
              {totalPnlPct != null ? fmtPct(totalPnlPct) : "—"}
            </p>
          </div>
          {/* 더보기 버튼 */}
          <button
            onClick={() => setShowActions(!showActions)}
            className="text-slate-600 hover:text-slate-300 mt-0.5 p-1"
          >
            <MoreVertical size={15} />
          </button>
        </div>
      </div>

      {/* 액션 메뉴 */}
      {showActions && (
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => { setShowActions(false); onTradeClick(holding) }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-700/60 hover:bg-slate-700 rounded-xl text-xs text-slate-300 transition-colors"
          >
            <TrendingUp size={12} /> 매매 기록
          </button>
          <button
            onClick={() => { setShowActions(false); setShowDeleteConfirm(true) }}
            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 rounded-xl text-xs text-red-400 transition-colors"
          >
            <Trash2 size={12} /> 삭제
          </button>
        </div>
      )}

      {/* 삭제 확인 */}
      {showDeleteConfirm && (
        <div className="mb-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 flex items-center justify-between">
          <p className="text-xs text-red-300">종목과 매매기록이 모두 삭제됩니다.</p>
          <div className="flex gap-2 ml-3 shrink-0">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="text-xs text-slate-400 hover:text-white px-2 py-1"
            >취소</button>
            <button
              onClick={() => remove()}
              className="text-xs bg-red-500 hover:bg-red-400 text-white px-3 py-1 rounded-lg transition-colors"
            >삭제</button>
          </div>
        </div>
      )}

      {/* 중단: 현재가 / 평균단가 / 수량 */}
      <div
        className="grid grid-cols-3 gap-2 mb-3 cursor-pointer"
        onClick={() => onTradeClick(holding)}
      >
        {[
          { label: "현재가",   value: fmtPrice(pc?.current_price, curr) },
          { label: "평균단가", value: fmtPrice(holding.avg_price, curr) },
          { label: "수량",     value: holding.quantity.toString() },
        ].map((item) => (
          <div key={item.label} className="bg-slate-700/40 rounded-xl px-3 py-2">
            <p className="text-[10px] text-slate-500 mb-0.5">{item.label}</p>
            <p className="text-xs font-medium">{item.value}</p>
          </div>
        ))}
      </div>

      {/* 하단: 펀더멘털 */}
      <div
        className="grid grid-cols-5 gap-1.5 cursor-pointer"
        onClick={() => onTradeClick(holding)}
      >
        {[
          { label: "PER",     value: pc?.per?.toFixed(1) ?? "—",            tooltip: "주가수익비율 (Trailing P/E)\n현재 주가 ÷ 최근 12개월 EPS" },
          { label: "Fwd PER", value: pc?.forward_per?.toFixed(1) ?? "—",    tooltip: "선행 주가수익비율 (Forward P/E)\n현재 주가 ÷ 향후 12개월 예상 EPS" },
          { label: "PSR",     value: pc?.psr?.toFixed(1) ?? "—",            tooltip: "주가매출비율 (Price/Sales)\n현재 주가 ÷ 주당 매출액" },
          { label: "시총",    value: fmtLarge(pc?.market_cap),              tooltip: "시가총액\n현재 주가 × 발행 주식수" },
          { label: "52W↑",   value: pc?.week52_low_pct != null ? fmtPct(pc.week52_low_pct) : "—", tooltip: "52주 저점 대비 상승률\n현재 주가가 52주 최저가보다 얼마나 올랐는지" },
        ].map((item) => (
          <div key={item.label} className="relative group text-center bg-slate-700/30 rounded-lg py-1.5">
            <p className="text-[9px] text-slate-500">{item.label}</p>
            <p className="text-[11px] font-medium mt-0.5">{item.value}</p>
            {/* 툴팁 */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-10 hidden group-hover:block">
              <div className="bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-left shadow-xl w-48">
                <p className="text-[11px] font-semibold text-slate-200 mb-1">{item.label}</p>
                {item.tooltip.split("\n").map((line, i) => (
                  <p key={i} className="text-[10px] text-slate-400 leading-relaxed">{line}</p>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {holding.memo && (
        <p className="mt-3 text-xs text-slate-500 border-t border-slate-700/50 pt-2 line-clamp-1">
          📝 {holding.memo}
        </p>
      )}
      <p className="text-center text-[10px] text-slate-600 mt-3">탭하여 매매 기록</p>
    </div>
  )
}

// ── 현금 모달 컴포넌트 ────────────────────────────────────────
  function CashModal({
  accounts,
  onClose,
}: {
  accounts: Account[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? 0)
  const [type, setType] = useState<"deposit" | "withdraw">("deposit")
  const [amount, setAmount] = useState("")

  const selectedAccount = accounts.find((a) => a.id === accountId)

  const { mutate: submitCash, isPending } = useMutation({
    mutationFn: async () => {
      const current = selectedAccount?.cash_amount ?? 0
      const delta = parseFloat(amount)
      const next = type === "deposit" ? current + delta : current - delta
      if (next < 0) throw new Error("잔고가 부족합니다")
      return updateCash(accountId, {
        amount: next,
        currency: selectedAccount?.currency ?? "USD",
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] })
      qc.invalidateQueries({ queryKey: ["portfolio-summary"] })
      onClose()
    },
    onError: (e: Error) => alert(e.message),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-slate-900 rounded-3xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold">현금 입출금</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={20} /></button>
        </div>

        {/* 입금/출금 탭 */}
        <div className="flex bg-slate-800 rounded-2xl p-1 mb-4">
          {(["deposit", "withdraw"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                type === t
                  ? t === "deposit"
                    ? "bg-emerald-500 text-white"
                    : "bg-red-500 text-white"
                  : "text-slate-400"
              }`}
            >
              {t === "deposit" ? "입금" : "출금"}
            </button>
          ))}
        </div>

        {/* 계좌 선택 */}
        <div className="mb-4">
          <label className="text-xs text-slate-400 mb-1.5 block">계좌</label>
          <div className="relative">
            <select
              className="w-full bg-slate-800 rounded-xl px-4 py-2.5 text-sm outline-none appearance-none"
              value={accountId}
              onChange={(e) => setAccountId(Number(e.target.value))}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} (현재 {a.currency} {a.cash_amount.toLocaleString()})
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>

        {/* 금액 */}
        <div className="mb-6">
          <label className="text-xs text-slate-400 mb-1.5 block">금액</label>
          <input
            type="number"
            className="w-full bg-slate-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-violet-500 text-white"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        <button
          onClick={() => submitCash()}
          disabled={!amount || isPending}
          className={`w-full rounded-2xl py-3.5 font-semibold text-sm transition-colors disabled:opacity-40 ${
            type === "deposit"
              ? "bg-emerald-500 hover:bg-emerald-400"
              : "bg-red-500 hover:bg-red-400"
          } text-white`}
        >
          {isPending ? "처리 중..." : type === "deposit" ? "입금" : "출금"}
        </button>
      </div>
    </div>
  )
}

// ── 종목 등록 모달 ────────────────────────────────────────

function AddHoldingModal({
  accounts,
  onClose,
}: {
  accounts: Account[]
  onClose: () => void
}) {
  const qc = useQueryClient()

  const [query, setQuery] = useState("")
  const [searchResults, setSearchResults] = useState<StockSearchResult[]>([])
  const [selected, setSelected] = useState<StockSearchResult | null>(null)
  const [accountId, setAccountId] = useState<number>(accounts[0]?.id ?? 0)
  const [avgPrice, setAvgPrice] = useState("")
  const [quantity, setQuantity] = useState("")
  const [memo, setMemo] = useState("")
  const [searching, setSearching] = useState(false)

  const { mutate: addHolding, isPending } = useMutation({
  mutationFn: async (body: HoldingCreate) => {
    // 잔고 체크
    const accountsList: Account[] = await fetchAccounts()
    const account = accountsList.find((a) => a.id === body.account_id)
    const currentCash = account?.cash_amount ?? 0
    const currency = account?.currency ?? "USD"
    const tradeAmount = body.avg_price * body.quantity

    if (currentCash < tradeAmount) {
      throw new Error(`잔고가 부족합니다.\n현재 잔고: ${currency} ${currentCash.toLocaleString()}\n필요 금액: ${currency} ${tradeAmount.toLocaleString()}`)
    }

    const holding = await createHolding(body)

    // 현금 차감
    await updateCash(body.account_id, {
      amount: currentCash - tradeAmount,
      currency,
    })

    // 매매 히스토리 등록
    await createTrade({
      holding_id: holding.id,
      account_id: body.account_id,
      ticker: holding.ticker,
      trade_type: "BUY",
      quantity: body.quantity,
      price: body.avg_price,
      memo: body.memo,
      tags: [],
      traded_at: new Date().toISOString(),
    })

    return holding
  },
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ["holdings"] })
    qc.invalidateQueries({ queryKey: ["portfolio-summary"] })
    qc.invalidateQueries({ queryKey: ["trades"] })
    qc.invalidateQueries({ queryKey: ["accounts"] })
    onClose()
  },
  onError: (e: Error) => {
    alert(e.message)
  },
})

  const handleSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    try {
      const res = await searchStock(query.trim())
      setSearchResults(res.results)
    } finally {
      setSearching(false)
    }
  }

  const handleSubmit = () => {
    if (!selected || !accountId || !avgPrice || !quantity) return
    addHolding({
      account_id: accountId,
      ticker: selected.ticker,
      avg_price: parseFloat(avgPrice),
      quantity: parseFloat(quantity),
      memo: memo || undefined,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* 딤 배경 */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-slate-900 rounded-t-3xl sm:rounded-3xl p-6 max-h-[92vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          {/* 💡 변경: 타이틀 색상 흰색으로 */}
          <h2 className="text-lg font-bold text-white">종목 등록</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* 종목 검색 */}
        <div className="mb-4">
          {/* 💡 변경: 라벨 색상 흰색으로 */}
          <label className="text-xs text-white mb-1.5 block">종목 검색</label>
          <div className="flex gap-2">
            <input
              className="flex-1 bg-slate-800 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-violet-500 placeholder:text-slate-500 border border-slate-700"
              placeholder="티커 또는 종목명 (예: AAPL, Apple)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <button
              onClick={handleSearch}
              disabled={searching}
              className="bg-violet-600 hover:bg-violet-500 text-white px-4 rounded-xl transition-colors disabled:opacity-50"
            >
              <Search size={16} />
            </button>
          </div>

          {/* 검색 결과 */}
          {searchResults.length > 0 && !selected && (
            <div className="mt-2 bg-slate-800 rounded-xl overflow-hidden border border-slate-700">
              {searchResults.map((r) => (
                <button
                  key={r.ticker}
                  onClick={() => { setSelected(r); setSearchResults([]) }}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-700 transition-colors text-left"
                >
                  <div>
                    <span className="font-semibold text-sm text-white">{r.ticker}</span>
                    <span className="text-slate-400 text-xs ml-2">{r.name}</span>
                  </div>
                  <span className="text-xs text-slate-500">{r.exchange}</span>
                </button>
              ))}
            </div>
          )}

          {/* 선택된 종목 표시 */}
          {selected && (
            <div className="mt-2 flex items-center justify-between bg-violet-500/20 border border-violet-500/50 rounded-xl px-4 py-3">
              <div>
                <span className="font-bold text-violet-300">{selected.ticker}</span>
                <span className="text-slate-300 text-xs ml-2">{selected.name}</span>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-white">
                <X size={14} />
              </button>
            </div>
          )}
        </div>

        {/* 계좌 선택 */}
        <div className="mb-4">
          <label className="text-xs text-white mb-1.5 block">계좌 선택 *</label>
          <div className="relative">
            <select
              className="w-full bg-slate-800 text-white rounded-xl px-4 py-2.5 text-sm outline-none border border-slate-700 focus:ring-1 focus:ring-violet-500 appearance-none cursor-pointer"
              value={accountId}
              onChange={(e) => setAccountId(Number(e.target.value))}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>

        {/* 진입가 */}
        <div className="mb-4">
          <label className="text-xs text-white mb-1.5 block">진입가 *</label>
          <input
            type="text"
            inputMode="decimal"
            // 💡 변경: 기존 인라인 스타일 지우고 어두운 톤의 Tailwind 클래스로 교체 (흰 글씨)
            className="w-full bg-slate-800 text-white border border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-violet-500 placeholder:text-slate-500"
            placeholder="0"
            value={avgPrice ? Number(avgPrice.replace(/,/g, "")).toLocaleString() : ""}
            onChange={(e) => {
              const raw = e.target.value.replace(/,/g, "")
              if (!isNaN(Number(raw))) setAvgPrice(raw)
            }} 
          />
        </div>

        {/* 수량 */}
        <div className="mb-4">
          <label className="text-xs text-white mb-1.5 block">보유 수량 *</label>
          <input
            type="text"
            inputMode="decimal"
            // 💡 변경: 기존 인라인 스타일 지우고 어두운 톤의 Tailwind 클래스로 교체 (흰 글씨)
            className="w-full bg-slate-800 text-white border border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-violet-500 placeholder:text-slate-500"
            placeholder="0"
            value={quantity ? Number(quantity.replace(/,/g, "")).toLocaleString() : ""}
            onChange={(e) => {
              const raw = e.target.value.replace(/,/g, "")
              if (!isNaN(Number(raw))) setQuantity(raw)
            }}
          />
        </div>

        {/* 메모 */}
        <div className="mb-6">
          <label className="text-xs text-white mb-1.5 block">매매 사유 메모</label>
          <textarea
            className="w-full bg-slate-800 text-white border border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-violet-500 resize-none placeholder:text-slate-500"
            placeholder="투자 thesis, 진입 이유 등..."
            rows={3}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
        </div>

        {/* 등록 버튼 */}
        <button
          onClick={handleSubmit}
          disabled={!selected || !accountId || !avgPrice || !quantity || isPending}
          className="w-full bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40 disabled:cursor-not-allowed rounded-2xl py-3.5 font-semibold text-sm transition-colors"
        >
          {isPending ? "등록 중..." : "종목 등록"}
        </button>
      </div>
    </div>
  )
}

// ── 메인 페이지 ──────────────────────────────────────────

export default function HoldingsPage() {
  const [filterAccountId, setFilterAccountId] = useState<number | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showCashModal, setShowCashModal] = useState(false)
  const [tradeTarget, setTradeTarget] = useState<HoldingOut | null>(null)
  const [showAccountModal, setShowAccountModal] = useState(false)

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: fetchAccounts,
  })

  const { data: holdings = [], isLoading } = useQuery({
    queryKey: ["holdings", filterAccountId],
    queryFn: () => fetchHoldings(filterAccountId),
  })

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      {/* 헤더 */}
      <div className="flex items-center gap-2 mb-5">
        <h1 className="text-xl font-bold flex-1">내 주식현황</h1>
        {/* 💡 변경: 계좌관리 버튼 색상을 더 돋보이는 slate-700과 흰 글씨로 변경 */}
        <button
          onClick={() => setShowAccountModal(true)}
          className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-full text-sm font-medium transition-colors text-white"
        >
          계좌관리
        </button>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 px-4 py-2 rounded-full text-sm font-medium transition-colors text-white"
        >
          <Plus size={15} />
          종목 추가
        </button>
      </div>

      {/* 계좌 필터 */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-5 scrollbar-none">
        <button
          onClick={() => setFilterAccountId(null)}
          className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            filterAccountId === null
              ? "bg-violet-500 text-white"
              : "bg-slate-800 text-slate-400 hover:text-slate-200"
          }`}
        >
          전체
        </button>
        {accounts.map((acc) => (
          <button
            key={acc.id}
            onClick={() => setFilterAccountId(acc.id)}
            className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filterAccountId === acc.id
                ? "bg-violet-500 text-white"
                : "bg-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            {acc.name}
          </button>
        ))}
      </div>

      {/* 💡 변경: 현금 버튼 색상도 통일감 있게 수정 */}
      <button
        onClick={() => setShowCashModal(true)}
        className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-full text-sm font-medium transition-colors text-white mb-5"
      >
        <Banknote size={15} />
        현금
      </button>

      {/* 종목 리스트 */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-44 bg-slate-800/40 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : holdings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-500">
          <TrendingUp size={40} className="mb-3 opacity-30" />
          <p className="text-sm">등록된 종목이 없습니다</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="mt-4 text-violet-400 text-sm hover:text-violet-300"
          >
            + 첫 종목 추가하기
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {holdings.map((h) => (
            <HoldingCard key={h.id} holding={h} accounts={accounts} onTradeClick={setTradeTarget} />
          ))}
        </div>
      )}

      {/* 종목 등록 모달 */}
      {showAddModal && (
        <AddHoldingModal
          accounts={accounts}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* 매매 기록 모달 */}
      {tradeTarget && (
        <TradeModal
          holding={tradeTarget}
          accounts={accounts}
          onClose={() => setTradeTarget(null)}
        />
      )}
      {showAccountModal && (
         <AccountModal onClose={() => setShowAccountModal(false)} />
      )}

      {showCashModal && (
        <CashModal accounts={accounts} onClose={() => setShowCashModal(false)} />
      )}
    </main>
  )
}