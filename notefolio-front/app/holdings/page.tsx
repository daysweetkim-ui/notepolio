"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchAccounts, fetchHoldings, createHolding, searchStock, deleteHolding, updateCash, fetchPortfolioSummary } from "@/lib/api"
import type { Account, HoldingOut, StockSearchResult } from "@/types"
import { Plus, Search, X, ChevronDown, TrendingUp, MoreVertical, Trash2, Banknote, DollarSign, Wallet } from "lucide-react"
import TradeModal from "@/components/holdings/TradeModal"
import AccountModal from "@/components/holdings/AccountModal"

// ── 포맷팅 헬퍼 ────────────────────────────────────────

function fmtPrice(v: number | null | undefined, displayCurrency: "KRW" | "USD", exchangeRate = 1400) {
  if (v == null) return "—"
  if (displayCurrency === "KRW") {
    return "₩" + Math.round(v).toLocaleString("ko-KR")
  }
  const usdVal = v / exchangeRate
  return "$" + usdVal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtPct(v: number | null | undefined) {
  if (v == null) return "—"
  return (v >= 0 ? "+" : "") + v.toFixed(2) + "%"
}

function formatInputNumber(val: string) {
  if (!val) return ""
  const parts = val.split(".")
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return parts.length > 1 ? `${parts[0]}.${parts[1]}` : parts[0]
}

function pnlColor(pct: number | null | undefined) {
  if (pct == null) return "text-slate-400"
  if (pct > 0) return "text-emerald-600 font-bold"
  if (pct < 0) return "text-red-500 font-bold"
  return "text-slate-400 font-bold"
}

// ── 종목 카드 ──────────────────────────────────────────

function HoldingCard({
  holding,
  accounts,
  displayCurrency,
  exchangeRate,
  onTradeClick
}: {
  holding: HoldingOut;
  accounts: Account[];
  displayCurrency: "KRW" | "USD";
  exchangeRate: number;
  onTradeClick: (h: HoldingOut) => void
}) {
  const qc = useQueryClient()
  const [showActions, setShowActions] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const pc = holding.price_info
  const currentPrice = pc?.current_price ?? holding.avg_price
  const evalValue = currentPrice * holding.quantity
  const totalPnlPct = holding.avg_price > 0 ? ((currentPrice - holding.avg_price) / holding.avg_price) * 100 : null

  const { mutate: remove } = useMutation({
    mutationFn: () => deleteHolding(holding.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["holdings"] })
      qc.invalidateQueries({ queryKey: ["portfolio-summary"] })
    },
  })

  const accountName = accounts.find(a => a.id === holding.account_id)?.name ?? ""

  return (
    // 💡 relative와 overflow-hidden을 추가하여 내부 요소들이 삐져나가지 않게 정리합니다.
    <div className="bg-white border border-slate-200 shadow-sm hover:shadow-md rounded-3xl p-4 sm:p-5 mb-4 relative overflow-hidden">
      
      {/* 💡 상단 헤더: 점 세개 버튼을 absolute로 띄워서 텍스트를 밀어내지 않게 수정! */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 cursor-pointer pr-1" onClick={() => onTradeClick(holding)}>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-extrabold text-base sm:text-lg text-slate-900 tracking-tight truncate max-w-[180px] sm:max-w-[220px]">
              {holding.name ?? holding.ticker}
            </span>
            {pc?.change_pct != null && (
              <span className={`text-[10px] sm:text-xs px-1.5 py-0.5 bg-slate-50 rounded-md border border-slate-100 whitespace-nowrap ${pnlColor(pc.change_pct)}`}>
                {fmtPct(pc.change_pct)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <p className="text-[10px] sm:text-xs font-bold text-slate-400">{holding.ticker}</p>
            {accountName && (
              <>
                <span className="text-slate-300">|</span>
                <span className="text-[10px] sm:text-xs font-bold text-violet-600 truncate max-w-[80px] sm:max-w-[120px]">{accountName}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-start">
          <div className="text-right cursor-pointer mr-7" onClick={() => onTradeClick(holding)}>
            <p className="font-black text-sm sm:text-base text-slate-900 truncate max-w-[90px] sm:max-w-[120px]">
              {fmtPrice(evalValue, displayCurrency, exchangeRate)}
            </p>
            <p className={`text-[10px] sm:text-xs mt-0.5 truncate ${pnlColor(totalPnlPct)}`}>
              {totalPnlPct != null ? fmtPct(totalPnlPct) : "—"}
            </p>
          </div>
          {/* 💡 공중에 띄워서 항상 우측 상단에 고정되는 점 세개 아이콘 */}
          <button 
            onClick={(e) => { e.stopPropagation(); setShowActions(!showActions); }} 
            className="absolute right-3 top-4 sm:top-5 text-slate-400 hover:text-slate-700 bg-slate-50 p-1.5 rounded-full transition-colors shrink-0"
          >
            <MoreVertical size={16} />
          </button>
        </div>
      </div>

      {showActions && (
        <div className="flex gap-2 mb-4">
          <button onClick={() => { setShowActions(false); onTradeClick(holding) }} className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 transition-colors rounded-xl text-xs font-bold text-slate-700">
            매매 / 히스토리
          </button>
          <button onClick={() => { setShowActions(false); setShowDeleteConfirm(true) }} className="px-4 py-2.5 bg-red-50 hover:bg-red-100 transition-colors text-red-600 rounded-xl text-xs font-bold shrink-0">
            삭제
          </button>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="mb-4 bg-red-50 p-3 rounded-xl flex flex-col sm:flex-row items-center justify-between border border-red-100 gap-2">
          <p className="text-xs font-bold text-red-600">정말 포지션을 완전히 삭제할까요?</p>
          <div className="flex gap-2">
            <button onClick={() => setShowDeleteConfirm(false)} className="text-xs font-bold text-slate-500 hover:text-slate-700 px-2 py-1.5">취소</button>
            <button onClick={() => remove()} className="text-xs font-bold bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg shadow-sm">삭제</button>
          </div>
        </div>
      )}

      {/* 💡 금액이 커져도 칸을 벗어나지 않도록 truncate(말줄임) 클래스 적용 */}
      <div className="grid grid-cols-3 gap-2 cursor-pointer" onClick={() => onTradeClick(holding)}>
        {[
          { label: "현재가", value: fmtPrice(pc?.current_price, displayCurrency, exchangeRate) },
          { label: "평균단가", value: fmtPrice(holding.avg_price, displayCurrency, exchangeRate) },
          { label: "수량", value: holding.quantity.toString() },
        ].map((item) => (
          <div key={item.label} className="bg-slate-50 border border-slate-100 rounded-xl px-2 sm:px-3 py-2 sm:py-2.5 overflow-hidden">
            <p className="text-[10px] font-bold text-slate-400 mb-1 truncate">{item.label}</p>
            <p className="text-[11px] sm:text-xs font-black text-slate-800 truncate">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 현금 입출금 모달 ────────────────────────────────────────

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
      const delta = parseFloat(amount.replace(/,/g, ""))
      const next = type === "deposit" ? current + delta : current - delta
      if (next < 0) throw new Error("잔고가 부족합니다")
      return updateCash(accountId, {
        amount: next,
        currency: "KRW",
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
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-black text-slate-900">현금 입출금</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 bg-slate-100 p-1.5 rounded-full"><X size={20} /></button>
        </div>

        <div className="flex bg-slate-100 rounded-2xl p-1.5 mb-5">
          {(["deposit", "withdraw"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                type === t
                  ? t === "deposit" ? "bg-emerald-500 text-white shadow-md" : "bg-red-500 text-white shadow-md"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t === "deposit" ? "입금" : "출금"}
            </button>
          ))}
        </div>

        <div className="mb-4">
          <label className="text-xs font-bold text-slate-600 mb-1.5 block">계좌</label>
          <div className="relative">
            <select
              className="w-full bg-white border border-slate-300 text-slate-900 font-bold rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-violet-500 appearance-none"
              value={accountId}
              onChange={(e) => setAccountId(Number(e.target.value))}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} (현재 ₩{a.cash_amount.toLocaleString()})
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>

        <div className="mb-6">
          <label className="text-xs font-bold text-slate-600 mb-1.5 block">금액 (₩)</label>
          <input
            type="text"
            inputMode="decimal"
            className="w-full bg-white border border-slate-300 text-slate-900 font-bold rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-violet-500 placeholder:text-slate-400"
            placeholder="0"
            value={formatInputNumber(amount)}
            onChange={(e) => {
              const raw = e.target.value.replace(/,/g, "")
              if (/^\d*$/.test(raw)) setAmount(raw)
            }}
          />
        </div>

        <button
          onClick={() => submitCash()}
          disabled={!amount || isPending}
          className={`w-full rounded-2xl py-3.5 font-bold text-sm transition-colors disabled:opacity-40 shadow-md text-white ${
            type === "deposit" ? "bg-emerald-500 hover:bg-emerald-600" : "bg-red-500 hover:bg-red-600"
          }`}
        >
          {isPending ? "처리 중..." : type === "deposit" ? "입금" : "출금"}
        </button>
      </div>
    </div>
  )
}

// ── 종목 등록 모달 ────────────────────────────────────────

function AddHoldingModal({ accounts, onClose }: { accounts: Account[]; onClose: () => void }) {
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
    mutationFn: async (body: any) => {
      const accountsList: Account[] = await fetchAccounts()
      const account = accountsList.find((a) => a.id === body.account_id)
      const currentCash = account?.cash_amount ?? 0
      const tradeAmount = body.avg_price * body.quantity

      if (currentCash < tradeAmount) throw new Error("계좌 잔고가 부족합니다.")
      
      const holding = await createHolding(body)
      await updateCash(body.account_id, { amount: currentCash - tradeAmount, currency: "KRW" })
      return holding
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["holdings"] })
      qc.invalidateQueries({ queryKey: ["portfolio-summary"] })
      onClose()
    },
    onError: (e: any) => alert(e.message)
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-black text-slate-900">종목 등록</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 bg-slate-100 p-1.5 rounded-full"><X size={18} /></button>
        </div>

        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              className="flex-1 bg-white border border-slate-300 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="티커 검색 (예: TSLA, AAPL)"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && document.getElementById("searchBtn")?.click()}
            />
            <button
              id="searchBtn"
              onClick={async () => {
                if (!query.trim()) return
                setSearching(true)
                const res = await searchStock(query.trim())
                setSearchResults(res.results)
                setSearching(false)
              }}
              className="bg-violet-600 text-white px-4 rounded-xl text-xs font-bold shadow-sm shrink-0"
            >
              {searching ? "..." : "검색"}
            </button>
          </div>

          {searchResults.length > 0 && !selected && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl max-h-40 overflow-y-auto">
              {searchResults.map(r => (
                <button
                  key={r.ticker}
                  onClick={() => { setSelected(r); setSearchResults([]) }}
                  className="w-full text-left px-3 py-2.5 border-b border-slate-200 text-xs text-slate-800 hover:bg-slate-100 last:border-0"
                >
                  <strong className="text-sm font-black mr-1">{r.ticker}</strong>
                  <span className="text-slate-500">{r.name}</span>
                </button>
              ))}
            </div>
          )}

          {selected && (
            <div className="bg-violet-50 p-3 rounded-xl flex items-center justify-between text-xs font-bold text-violet-700 border border-violet-100">
              <span className="truncate pr-2">선택됨: {selected.ticker}</span>
              <button onClick={() => setSelected(null)} className="hover:text-red-500 transition-colors shrink-0"><X size={16} /></button>
            </div>
          )}
          
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">계좌 선택</label>
            <div className="relative">
              <select className="w-full border border-slate-300 p-3 rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-violet-500 appearance-none" value={accountId} onChange={e => setAccountId(Number(e.target.value))}>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">매입 단가 (₩ 원화) *</label>
            <input
              type="text"
              inputMode="decimal"
              className="w-full border border-slate-300 p-3 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="0"
              value={formatInputNumber(avgPrice)}
              onChange={e => {
                const raw = e.target.value.replace(/,/g, "")
                if(/^\d*$/.test(raw)) setAvgPrice(raw)
              }}
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">수량 *</label>
            <input
              type="text"
              inputMode="decimal"
              className="w-full border border-slate-300 p-3 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="0"
              value={formatInputNumber(quantity)}
              onChange={e => {
                const raw = e.target.value.replace(/,/g, "")
                if(/^\d*\.?\d*$/.test(raw)) setQuantity(raw)
              }}
            />
          </div>

          <button
            onClick={() => selected && addHolding({ account_id: accountId, ticker: selected.ticker, avg_price: parseFloat(avgPrice.replace(/,/g, "")), quantity: parseFloat(quantity.replace(/,/g, "")), memo })}
            disabled={isPending || !selected || !avgPrice || !quantity}
            className="w-full bg-violet-600 hover:bg-violet-700 transition-colors text-white py-3.5 rounded-xl font-bold text-sm shadow-md disabled:opacity-40"
          >
            {isPending ? "등록 중..." : "종목 등록 완료"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 메인 페이지 (HoldingsPage) ────────────────────────────────

export default function HoldingsPage() {
  const [filterAccountId, setFilterAccountId] = useState<number | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showCashModal, setShowCashModal] = useState(false)
  const [showAccountModal, setShowAccountModal] = useState(false)
  const [tradeTarget, setTradeTarget] = useState<HoldingOut | null>(null)
  const [displayCurrency, setDisplayCurrency] = useState<"KRW" | "USD">("KRW")

  const { data: accounts = [] } = useQuery({ queryKey: ["accounts"], queryFn: fetchAccounts })
  const { data: holdings = [], isLoading } = useQuery({ queryKey: ["holdings", filterAccountId], queryFn: () => fetchHoldings(filterAccountId) })
  const { data: summary } = useQuery<any>({ queryKey: ["portfolio-summary", null], queryFn: () => fetchPortfolioSummary(null) })
  
  const exchangeRate = summary?.exchange_rate ?? 1400

  return (
    // 💡 가로 사이즈를 max-w-lg로 통일하고 하단 바에 가리지 않도록 pb-24를 추가했습니다!
    <main className="max-w-lg mx-auto px-4 pt-6 pb-24 space-y-5">
      
      {/* 상단 헤더 및 기능 버튼들 */}
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-xl font-bold text-slate-800 tracking-tight">내 주식현황</h1>
        <div className="flex items-center gap-2">
          {/* 💡 좁은 모바일 화면을 위해 hidden sm:inline 클래스로 작은 화면에서 텍스트를 숨김 처리합니다. */}
          <button
            onClick={() => setDisplayCurrency(displayCurrency === "KRW" ? "USD" : "KRW")}
            className="flex items-center gap-1 bg-white border border-slate-200 px-2.5 py-2 rounded-xl text-xs font-bold text-slate-500 shadow-sm hover:bg-slate-50 transition-colors shrink-0"
          >
            {displayCurrency === "KRW" ? <Banknote size={14} /> : <DollarSign size={14} />}
            <span className="hidden sm:inline">{displayCurrency === "KRW" ? "원화" : "달러"}</span>
          </button>
          
          <button
            onClick={() => setShowAccountModal(true)}
            className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 px-2.5 py-2 rounded-xl text-xs font-bold transition-colors text-slate-700 shrink-0"
          >
            <Wallet size={14} />
            <span className="hidden sm:inline">계좌</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1 bg-violet-600 hover:bg-violet-700 text-white px-2.5 py-2 rounded-xl text-xs font-bold shadow-sm transition-colors shrink-0"
          >
            <Plus size={14} />
            <span className="hidden sm:inline">추가</span>
          </button>
        </div>
      </div>

      {/* 계좌 필터 탭 바 (가로 스크롤 가능) */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        <button
          onClick={() => setFilterAccountId(null)}
          className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-bold border transition-colors ${
            filterAccountId === null ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
          }`}
        >
          전체
        </button>
        {accounts.map(a => (
          <button
            key={a.id}
            onClick={() => setFilterAccountId(a.id)}
            className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-bold border transition-colors ${
              filterAccountId === a.id ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
            }`}
          >
            {a.name}
          </button>
        ))}
      </div>

      <button
        onClick={() => setShowCashModal(true)}
        className="flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 px-4 py-2 rounded-full text-xs font-bold transition-colors text-emerald-600 shadow-sm"
      >
        <Banknote size={15} />
        현금 입출금
      </button>

      {/* 종목 리스트 */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-40 bg-white border border-slate-100 rounded-3xl animate-pulse shadow-sm" />)}
        </div>
      ) : holdings.length === 0 ? (
        <div className="text-center py-20 bg-white border border-dashed border-slate-200 rounded-3xl text-sm text-slate-400 font-bold shadow-sm">
          <TrendingUp size={40} className="mx-auto mb-3 text-slate-200" />
          등록된 주식이 없습니다.
        </div>
      ) : (
        <div className="space-y-4">
          {holdings.map(h => (
            <HoldingCard key={h.id} holding={h} accounts={accounts} displayCurrency={displayCurrency} exchangeRate={exchangeRate} onTradeClick={setTradeTarget} />
          ))}
        </div>
      )}

      {/* 모달 창들 */}
      {showAddModal && <AddHoldingModal accounts={accounts} onClose={() => setShowAddModal(false)} />}
      {tradeTarget && <TradeModal holding={tradeTarget} accounts={accounts} displayCurrency={displayCurrency} exchangeRate={exchangeRate} onClose={() => setTradeTarget(null)} />}
      {showCashModal && <CashModal accounts={accounts} onClose={() => setShowCashModal(false)} />}
      {showAccountModal && <AccountModal onClose={() => setShowAccountModal(false)} />}
    </main>
  )
}