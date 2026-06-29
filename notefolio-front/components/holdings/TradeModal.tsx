"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchTrades, createTrade, deleteTrade, updateCash } from "@/lib/api"
import type { Account, HoldingOut } from "@/types"
import { X, TrendingUp, TrendingDown, Trash2 } from "lucide-react"

function formatInputNumber(val: string) {
  if (!val) return ""
  const parts = val.split(".")
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return parts.length > 1 ? `${parts[0]}.${parts[1]}` : parts[0]
}

function fmtPrice(v: number | null | undefined, displayCurrency: "KRW" | "USD", exchangeRate = 1400) {
  if (v == null) return "—"
  if (displayCurrency === "KRW") {
    return "₩" + Math.round(v).toLocaleString("ko-KR")
  }
  const usdVal = v / exchangeRate
  return "$" + usdVal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function TradeModal({
  holding,
  accounts,
  displayCurrency,
  exchangeRate,
  onClose,
}: {
  holding: HoldingOut
  accounts: Account[]
  displayCurrency: "KRW" | "USD"
  exchangeRate: number;
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [type, setType] = useState<"BUY" | "SELL">("BUY")
  const [price, setPrice] = useState("")
  const [quantity, setQuantity] = useState("")
  const [memo, setMemo] = useState("")

  const account = accounts.find((a) => a.id === holding.account_id)

  const { data: tradesRes, isLoading } = useQuery({
    queryKey: ["trades", holding.id],
    queryFn: () => fetchTrades({ accountId: holding.account_id, tradeType: null, limit: 30 }),
  })

  const trades = tradesRes?.items.filter((t) => t.holding_id === holding.id) ?? []

  const { mutate: submitTrade, isPending } = useMutation({
    mutationFn: async () => {
      const tradePrice = parseFloat(price.replace(/,/g, ""))
      const tradeQty = parseFloat(quantity.replace(/,/g, ""))
      if (!tradePrice || !tradeQty) throw new Error("가격과 수량을 바르게 입력해 주세요.")

      const tradeAmount = tradePrice * tradeQty
      let nextCash = account?.cash_amount ?? 0

      if (type === "BUY") {
        nextCash -= tradeAmount
        if (nextCash < 0) throw new Error("계좌의 현금 잔고가 부족합니다.")
      } else {
        if (tradeQty > holding.quantity) throw new Error("보유 주식 수량보다 더 많이 팔 수 없습니다.")
        nextCash += tradeAmount
      }

      await createTrade({
        holding_id: holding.id,
        account_id: holding.account_id,
        ticker: holding.ticker,
        trade_type: type,
        price: tradePrice,
        quantity: tradeQty,
        memo: memo || undefined,
        tags: [],
        traded_at: new Date().toISOString(),
      })

      await updateCash(holding.account_id, { amount: nextCash, currency: "KRW" })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["holdings"] })
      qc.invalidateQueries({ queryKey: ["portfolio-summary"] })
      qc.invalidateQueries({ queryKey: ["accounts"] })
      qc.invalidateQueries({ queryKey: ["trades", holding.id] })
      setPrice("")
      setQuantity("")
      setMemo("")
    },
    onError: (e: any) => alert(e.message)
  })

  const { mutate: removeTrade } = useMutation({
    mutationFn: deleteTrade,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trades", holding.id] })
      qc.invalidateQueries({ queryKey: ["holdings"] })
      qc.invalidateQueries({ queryKey: ["portfolio-summary"] })
    }
  })

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      
      {/* 💡 해결 4: 매매 및 최근 기록 피드 전체 화면을 완전한 화이트&소프트 실버 카드 테마로 전환 완료 */}
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl p-6 max-h-[88vh] overflow-y-auto shadow-2xl text-slate-800">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-black text-slate-900">{holding.name ?? holding.ticker} 매매 기록</h2>
            <p className="text-xs font-bold text-slate-400 mt-0.5">평균단가: {fmtPrice(holding.avg_price, displayCurrency, exchangeRate)}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 bg-slate-100 p-2 rounded-full"><X size={18} /></button>
        </div>

        {/* 거래 등록 폼 */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-6">
          <div className="flex bg-slate-200 rounded-xl p-1 mb-4">
            {(["BUY", "SELL"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                  type === t ? (t === "BUY" ? "bg-red-500 text-white" : "bg-blue-500 text-white") : "text-slate-500"
                }`}
              >
                {t === "BUY" ? "추가 매수" : "일부 매도"}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-[11px] font-bold text-slate-500 block mb-1">체결 가격 (₩) *</label>
              <input type="text" inputMode="decimal" className="w-full bg-white border p-2.5 rounded-xl text-sm font-bold text-slate-800 outline-none focus:ring-1 focus:ring-violet-500" placeholder="0" value={formatInputNumber(price)} onChange={e => { const raw = e.target.value.replace(/,/g, ""); if(/^\d*$/.test(raw)) setPrice(raw) }} />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-500 block mb-1">체결 수량 (주) *</label>
              <input type="text" inputMode="decimal" className="w-full bg-white border p-2.5 rounded-xl text-sm font-bold text-slate-800 outline-none focus:ring-1 focus:ring-violet-500" placeholder="0" value={formatInputNumber(quantity)} onChange={e => { const raw = e.target.value.replace(/,/g, ""); if(/^\d*\.?\d*$/.test(raw)) setQuantity(raw) }} />
            </div>
          </div>

          <button onClick={() => submitTrade()} disabled={isPending || !price || !quantity} className={`w-full py-3 rounded-xl text-white font-bold text-sm shadow-sm ${type === "BUY" ? "bg-red-500 hover:bg-red-600" : "bg-blue-500 hover:bg-blue-600"}`}>{isPending ? "기록 중..." : "매매 히스토리 추가"}</button>
        </div>

        {/* 내역 피드 리스트 */}
        <div>
          <h3 className="text-xs font-black text-slate-600 mb-2.5 px-1">과거 매매 거래 피드</h3>
          {isLoading ? (
            <p className="text-center py-4 text-xs font-bold text-slate-400">가져오는 중...</p>
          ) : trades.length === 0 ? (
            <p className="text-center py-6 text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed">매매 내역 히스토리가 비어있습니다.</p>
          ) : (
            <div className="space-y-2 max-h-44 overflow-y-auto pr-0.5">
              {trades.map((t) => (
                <div key={t.id} className="flex items-center justify-between border border-slate-200 bg-white p-3 rounded-xl shadow-sm">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${t.trade_type === "BUY" ? "bg-red-50 text-red-500" : "bg-blue-50 text-blue-500"}`}>{t.trade_type === "BUY" ? "매수" : "매도"}</div>
                    <div>
                      <p className="text-xs font-black text-slate-800">{t.quantity.toLocaleString()} 주</p>
                      <p className="text-[10px] font-semibold text-slate-400 mt-0.5">단가 {fmtPrice(t.price, displayCurrency, exchangeRate)} · {new Date(t.traded_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end">
                    <p className="text-xs font-black text-slate-700">{fmtPrice(t.price * t.quantity, displayCurrency, exchangeRate)}</p>
                    <button onClick={() => confirm("이 거래 피드 내역을 삭제할까요?") && removeTrade(t.id)} className="text-[9px] font-bold text-slate-300 hover:text-red-500 mt-1 transition-colors"><Trash2 size={10} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}