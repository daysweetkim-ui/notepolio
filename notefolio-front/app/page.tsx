"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { fetchAccounts, fetchPortfolioSummary, fetchMarketSentiment } from "@/lib/api"
import AccountTabs from "@/components/dashboard/AccountTabs"
import SectorDonutChart from "@/components/dashboard/SectorDonutChart"
import FearGreedGauge from "@/components/dashboard/FearGreedGauge"
import { DollarSign, Banknote } from "lucide-react"

type ChartView = "sector" | "ticker" | "account"

export default function DashboardPage() {
  const router = useRouter()
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null)
  const [chartView, setChartView] = useState<ChartView>("sector")
  const [viewCurrency, setViewCurrency] = useState<"KRW" | "USD">("KRW")

  useEffect(() => {
    const token = localStorage.getItem("token")
    if (!token) router.push("/login")
  }, [router])

  const { data: accounts = [] } = useQuery({ queryKey: ["accounts"], queryFn: fetchAccounts })

  const { data: summary, isLoading: summaryLoading } = useQuery<any>({
    queryKey: ["portfolio-summary", selectedAccountId],
    queryFn: () => fetchPortfolioSummary(selectedAccountId),
  })

  const { data: sentiment } = useQuery({
    queryKey: ["market-sentiment"],
    queryFn: fetchMarketSentiment,
    staleTime: 1000 * 60 * 60,
  })

  const fmt = (val: number | undefined | null) => {
    if (val == null) return "—"
    if (viewCurrency === "KRW") {
      return "₩" + Math.round(val).toLocaleString("ko-KR")
    }
    const usdVal = summary?.exchange_rate ? val / summary.exchange_rate : val / 1400
    return "$" + usdVal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const fmtPct = (buy: number, evalVal: number) => {
    if (!buy || buy === 0) return "0.00%"
    const pct = ((evalVal - buy) / buy) * 100
    return (pct > 0 ? "+" : "") + pct.toFixed(2) + "%"
  }

  const pnlColor = (buy: number, evalVal: number) => {
    if (!buy || buy === 0) return "text-slate-400 font-bold"
    if (evalVal > buy) return "text-emerald-600 font-bold"
    if (evalVal < buy) return "text-red-500 font-bold"
    return "text-slate-400 font-bold"
  }

  const chartData = (() => {
    if (!summary) return []
    const cashSlice = summary.total_cash > 0 ? [{ sector: "현금", value: summary.total_cash, pct: summary.cash_pct }] : []
    if (chartView === "ticker") {
      return [
        ...summary.ticker_weights.map((t: any) => ({ sector: t.name ?? t.ticker, value: t.value, pct: t.pct })),
        ...cashSlice,
      ]
    }
    if (chartView === "account") return summary.account_weights ?? []
    return [...summary.sector_weights, ...cashSlice]
  })()

  const chartViewOptions: { key: ChartView; label: string }[] = [
    { key: "sector", label: "섹터" },
    { key: "ticker", label: "종목" },
    ...(selectedAccountId === null ? [{ key: "account" as ChartView, label: "계좌" }] : []),
  ]

  return (
    // 💡 가로폭(max-w-lg) 통일 및 하단 여백(pb-24) 추가로 스크롤 시 짤림 방지
    <main className="max-w-lg mx-auto px-4 pt-6 pb-24 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-700 tracking-tight">대시보드</h1>
        <button
          onClick={() => setViewCurrency(viewCurrency === "KRW" ? "USD" : "KRW")}
          className="flex items-center gap-1 bg-white border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50 transition-colors shadow-sm shrink-0"
        >
          {viewCurrency === "KRW" ? <Banknote size={14} /> : <DollarSign size={14} />}
          {viewCurrency === "KRW" ? "원화 보기" : "달러 보기"}
        </button>
      </div>

      <AccountTabs accounts={accounts} selectedId={selectedAccountId} onSelect={(id) => { setSelectedAccountId(id); if (id !== null && chartView === "account") setChartView("sector") }} />

      {summaryLoading ? (
        <div className="h-48 bg-white border border-slate-200 rounded-3xl animate-pulse shadow-sm" />
      ) : summary ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-5 shadow-sm space-y-4">
          
          {/* 💡 그리드 텍스트에 truncate를 넣어 박스를 벗어나지 않도록 수정 */}
          <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
            {[
              { label: "총 자산", val: fmt(summary.total_asset) },
              { label: "주식 평가액", val: fmt(summary.total_stock_value) },
              { label: "현금 잔고", val: fmt(summary.total_cash) },
              { label: "매입 금액", val: fmt(summary.total_stock_buy) },
              { label: "평가 금액", val: fmt(summary.total_stock_value) },
              { label: "평가 손익", val: fmtPct(summary.total_stock_buy, summary.total_stock_value), isPct: true }
            ].map((item, idx) => (
              <div key={idx} className="bg-slate-50 border border-slate-100 rounded-2xl p-2 sm:p-3 text-center shadow-sm overflow-hidden">
                <p className="text-[10px] font-bold text-slate-400 mb-1 truncate">{item.label}</p>
                <p className={`text-xs sm:text-sm font-black truncate ${item.isPct ? pnlColor(summary.total_stock_buy, summary.total_stock_value) : "text-slate-700"}`}>
                  {item.val}
                </p>
              </div>
            ))}
          </div>
          
        </div>
      ) : null}

      <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm font-bold text-slate-600 truncate mr-2">{selectedAccountId ? `${accounts.find((a) => a.id === selectedAccountId)?.name}` : "전체 자산"} 비중 (합계 100%)</p>
          <div className="flex bg-slate-100 rounded-xl p-1 shrink-0">
            {chartViewOptions.map((opt) => (
              <button key={opt.key} onClick={() => setChartView(opt.key)} className={`px-2 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${chartView === opt.key ? "bg-white text-violet-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{opt.label}</button>
            ))}
          </div>
        </div>
        {summaryLoading ? <div className="h-48 rounded-xl animate-pulse bg-slate-50" /> : <SectorDonutChart data={chartData} />}
      </div>
      {sentiment && <FearGreedGauge sentiment={sentiment} />}
    </main>
  )
}