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

    <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">

      <div className="flex items-center justify-between">

        <h1 className="text-xl font-bold text-slate-700 tracking-tight">대시보드</h1>

        <button

          onClick={() => setViewCurrency(viewCurrency === "KRW" ? "USD" : "KRW")}

          className="flex items-center gap-1 bg-white border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50 transition-colors shadow-sm"

        >

          {viewCurrency === "KRW" ? <Banknote size={14} /> : <DollarSign size={14} />}

          {viewCurrency === "KRW" ? "원화 보기" : "달러 보기"}

        </button>

      </div>



      <AccountTabs accounts={accounts} selectedId={selectedAccountId} onSelect={(id) => { setSelectedAccountId(id); if (id !== null && chartView === "account") setChartView("sector") }} />



      {summaryLoading ? (

        <div className="h-48 bg-white border border-slate-200 rounded-3xl animate-pulse shadow-sm" />

      ) : summary ? (

        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-4">

          

          {/* 💡 해결 1: 부드러운 텍스트 크기와 6개 칸이 자로 잰 듯 똑같은 크기로 정렬된 자산 그리드 블록 */}

          <div className="grid grid-cols-3 gap-2.5">

            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3.5 text-center shadow-sm">

              <p className="text-[10px] font-bold text-slate-400 mb-1">총 자산</p>

              <p className="text-sm font-black text-slate-700">{fmt(summary.total_asset)}</p>

            </div>

            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3.5 text-center shadow-sm">

              <p className="text-[10px] font-bold text-slate-400 mb-1">주식 평가액</p>

              <p className="text-sm font-black text-slate-700">{fmt(summary.total_stock_value)}</p>

            </div>

            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3.5 text-center shadow-sm">

              <p className="text-[10px] font-bold text-slate-400 mb-1">현금 잔고</p>

              <p className="text-sm font-black text-slate-700">{fmt(summary.total_cash)}</p>

            </div>



            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3.5 text-center shadow-sm">

              <p className="text-[10px] font-bold text-slate-400 mb-1">매입 금액</p>

              <p className="text-sm font-black text-slate-700">{fmt(summary.total_stock_buy)}</p>

            </div>

            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3.5 text-center shadow-sm">

              <p className="text-[10px] font-bold text-slate-400 mb-1">평가 금액</p>

              <p className="text-sm font-black text-slate-700">{fmt(summary.total_stock_value)}</p>

            </div>

            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3.5 text-center shadow-sm">

              <p className="text-[10px] font-bold text-slate-400 mb-1">평가 손익</p>

              <p className={`text-sm ${pnlColor(summary.total_stock_buy, summary.total_stock_value)}`}>

                {fmtPct(summary.total_stock_buy, summary.total_stock_value)}

              </p>

            </div>

          </div>

          

        </div>

      ) : null}



      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">

        <div className="flex items-center justify-between mb-6">

          <p className="text-sm font-bold text-slate-600">{selectedAccountId ? `${accounts.find((a) => a.id === selectedAccountId)?.name}` : "전체 자산"} 비중 (합계 100%)</p>

          <div className="flex bg-slate-100 rounded-xl p-1">

            {chartViewOptions.map((opt) => (

              <button key={opt.key} onClick={() => setChartView(opt.key)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${chartView === opt.key ? "bg-white text-violet-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{opt.label}</button>

            ))}

          </div>

        </div>

        {summaryLoading ? <div className="h-48 rounded-xl animate-pulse bg-slate-50" /> : <SectorDonutChart data={chartData} />}

      </div>

      {sentiment && <FearGreedGauge sentiment={sentiment} />}

    </main>

  )

}

