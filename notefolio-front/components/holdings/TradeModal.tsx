"use client"

import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createTrade, fetchAccounts, updateCash } from "@/lib/api"
import type { Account, HoldingOut, TradeCreate } from "@/types"
import { X, ChevronDown, TrendingUp, TrendingDown } from "lucide-react"

interface Props {
  holding: HoldingOut
  accounts: Account[]
  onClose: () => void
}

export default function TradeModal({ holding, accounts, onClose }: Props) {
  const qc = useQueryClient()

  const [tradeType, setTradeType] = useState<"BUY" | "SELL">("BUY")
  const [accountId, setAccountId] = useState<number>(holding.account_id)
  const [quantity, setQuantity] = useState("")
  const [price, setPrice] = useState(
    holding.price_info?.current_price?.toFixed(2) ?? holding.avg_price.toFixed(2)
  )
  const [memo, setMemo] = useState("")
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState("")

  const rawQty = parseFloat((quantity || "0").replace(/,/g, ""))
  const rawPrice = parseFloat((price || "0").replace(/,/g, ""))
  const totalAmount = rawQty * rawPrice
  const expectedPnl =
        tradeType === "SELL" && rawQty > 0 && rawPrice > 0
        ? (rawPrice - holding.avg_price) * rawQty
        : null  

  const { mutate: recordTrade, isPending } = useMutation({
  mutationFn: async (body: TradeCreate) => {
    // 현재 계좌 잔고 조회
    const accounts: Account[] = await fetchAccounts()
    const account = accounts.find((a) => a.id === body.account_id)
    const currentCash = account?.cash_amount ?? 0
    const currency = account?.currency ?? "USD"
    const tradeAmount = body.quantity * body.price

    if (body.trade_type === "BUY") {
      // 잔고 부족 체크
      if (currentCash < tradeAmount) {
        throw new Error(`잔고가 부족합니다.\n현재 잔고: ${currency} ${currentCash.toLocaleString()}\n필요 금액: ${currency} ${tradeAmount.toLocaleString()}`)
      }
      // 현금 차감
      await updateCash(body.account_id, {
        amount: currentCash - tradeAmount,
        currency,
      })
    } else {
      // 매도 시 현금 증가
      await updateCash(body.account_id, {
        amount: currentCash + tradeAmount,
        currency,
      })
    }

    return createTrade(body)
  },
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ["holdings"] })
    qc.invalidateQueries({ queryKey: ["trades"] })
    qc.invalidateQueries({ queryKey: ["portfolio-summary"] })
    qc.invalidateQueries({ queryKey: ["accounts"] })
    onClose()
  },
  onError: (e: Error) => {
    alert(e.message)
  },
})

  const handleAddTag = () => {
    const t = tagInput.trim()
    if (t && !tags.includes(t)) setTags([...tags, t])
    setTagInput("")
  }

const handleSubmit = () => {
  if (!quantity || !price) return
    recordTrade({
      holding_id: holding.id,
      account_id: accountId,
      ticker: holding.ticker,
      trade_type: tradeType,
      quantity: parseFloat(quantity.replace(/,/g, "")),
      price: parseFloat(price.replace(/,/g, "")),
      memo: memo || undefined,
      tags,
      traded_at: new Date().toISOString(),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* 딤 배경 */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* 모달 본체 — 아래에서 슬라이드업 */}
      <div className="relative w-full max-w-lg bg-slate-900 rounded-3xl p-6 max-h-[90vh] overflow-y-auto animate-slide-up">

        {/* 핸들 바 */}
        <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mb-5" />

        {/* 헤더 */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold">{holding.ticker}</span>
              {holding.price_info?.change_pct != null && (
                <span className={`text-sm font-medium ${
                  holding.price_info.change_pct >= 0 ? "text-emerald-400" : "text-red-400"
                }`}>
                  {holding.price_info.change_pct >= 0 ? "+" : ""}
                  {holding.price_info.change_pct.toFixed(2)}%
                </span>
              )}
            </div>
            <p className="text-slate-400 text-xs mt-0.5">{holding.name}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white mt-1">
            <X size={20} />
          </button>
        </div>

        {/* 현재 포지션 요약 */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          {[
            { label: "현재가",   value: holding.price_info?.current_price != null ? `$${holding.price_info.current_price.toFixed(2)}` : "—" },
            { label: "평균단가", value: `$${holding.avg_price.toFixed(2)}` },
            { label: "보유수량", value: `${holding.quantity}주` },
          ].map((item) => (
            <div key={item.label} className="bg-slate-800/60 rounded-xl px-3 py-2 text-center">
              <p className="text-[10px] text-slate-500 mb-0.5">{item.label}</p>
              <p className="text-xs font-semibold">{item.value}</p>
            </div>
          ))}
        </div>

        {/* 매수 / 매도 탭 */}
        <div className="flex bg-slate-800 rounded-2xl p-1 mb-5">
          {(["BUY", "SELL"] as const).map((type) => (
            <button
              key={type}
              onClick={() => setTradeType(type)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                tradeType === type
                  ? type === "BUY"
                    ? "bg-emerald-500 text-white shadow-lg"
                    : "bg-red-500 text-white shadow-lg"
                  : "text-slate-400"
              }`}
            >
              {type === "BUY"
                ? <><TrendingUp size={15} /> 매수</>
                : <><TrendingDown size={15} /> 매도</>
              }
            </button>
          ))}
        </div>

        {/* 계좌 선택 */}
        <div className="mb-4">
          <label className="text-xs text-slate-400 mb-1.5 block">계좌</label>
          <div className="relative">
            <select
              className="w-full bg-slate-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-violet-500 appearance-none cursor-pointer"
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

{/* 수량 / 단가 */}
<div className="grid grid-cols-2 gap-3 mb-4">
  <div>
    <label className="text-xs mb-1.5 block" style={{ color: "var(--text-secondary)" }}>
      수량 *
    </label>
    <input
      type="text"
      inputMode="decimal"
      className="w-full rounded-xl px-4 py-2.5 text-sm outline-none"
      style={{ backgroundColor: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
      placeholder="0"
      value={quantity ? Number(quantity.replace(/,/g, "")).toLocaleString() : ""}
      onChange={(e) => {
        const raw = e.target.value.replace(/,/g, "")
        if (!isNaN(Number(raw))) setQuantity(raw)
      }}
    />
  </div>
  <div>
    <label className="text-xs mb-1.5 block" style={{ color: "var(--text-secondary)" }}>
      단가 *
    </label>
    <input
      type="text"
      inputMode="decimal"
      className="w-full rounded-xl px-4 py-2.5 text-sm outline-none"
      style={{ backgroundColor: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
      placeholder="0.00"
      value={price ? Number(price.replace(/,/g, "")).toLocaleString() : ""}
      onChange={(e) => {
        const raw = e.target.value.replace(/,/g, "")
        if (!isNaN(Number(raw))) setPrice(raw)
      }}
    />
  </div>
</div>

        {/* 거래 금액 미리보기 */}
        {totalAmount > 0 && (
          <div className={`rounded-xl px-4 py-3 mb-4 ${
            tradeType === "BUY" ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-red-500/10 border border-red-500/20"
          }`}>
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-400">거래 금액</span>
              <span className="font-semibold text-sm">
                ${totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            {expectedPnl != null && (
              <div className="flex justify-between items-center mt-1">
                <span className="text-xs text-slate-400">예상 실현손익</span>
                <span className={`font-semibold text-sm ${expectedPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {expectedPnl >= 0 ? "+" : ""}${expectedPnl.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* 메모 */}
        <div className="mb-4">
          <label className="text-xs text-slate-400 mb-1.5 block">메모</label>
          <textarea
            className="w-full bg-slate-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-violet-500 resize-none"
            placeholder="매매 사유, 전략 메모..."
            rows={2}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
        </div>

        {/* 태그 */}
        <div className="mb-6">
          <label className="text-xs text-slate-400 mb-1.5 block">태그</label>
          <div className="flex gap-2 mb-2 flex-wrap">
            {tags.map((t) => (
              <span
                key={t}
                className="flex items-center gap-1 bg-violet-500/20 text-violet-300 text-xs px-3 py-1 rounded-full"
              >
                {t}
                <button onClick={() => setTags(tags.filter((x) => x !== t))}>
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              className="flex-1 bg-slate-800 rounded-xl px-4 py-2 text-sm outline-none focus:ring-1 focus:ring-violet-500 placeholder:text-slate-600"
              placeholder="분할매수, 장기보유, 실적플레이..."
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
            />
            <button
              onClick={handleAddTag}
              className="bg-slate-700 hover:bg-slate-600 px-4 rounded-xl text-sm transition-colors"
            >
              추가
            </button>
          </div>
        </div>

        {/* 기록 버튼 */}
        <button
          onClick={handleSubmit}
          disabled={!quantity || !price || isPending}
          className={`w-full disabled:opacity-40 disabled:cursor-not-allowed rounded-2xl py-3.5 font-semibold text-sm transition-colors ${
            tradeType === "BUY"
              ? "bg-emerald-500 hover:bg-emerald-400"
              : "bg-red-500 hover:bg-red-400"
          }`}
        >
          {isPending ? "기록 중..." : tradeType === "BUY" ? "매수 기록" : "매도 기록"}
        </button>
      </div>
    </div>
  )
}