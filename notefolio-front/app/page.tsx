"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { fetchAccounts, fetchPortfolioSummary, fetchMarketSentiment } from "@/lib/api"
import AccountTabs from "@/components/dashboard/AccountTabs"
import AssetSummary from "@/components/dashboard/AssetSummary"
import SectorDonutChart from "@/components/dashboard/SectorDonutChart"
import FearGreedGauge from "@/components/dashboard/FearGreedGauge"

type ChartView = "sector" | "ticker" | "account"

export default function DashboardPage() {
  const router = useRouter()
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null)
  const [chartView, setChartView] = useState<ChartView>("sector")

  useEffect(() => {
    const token = localStorage.getItem("token")
    if (!token) router.push("/login")
  }, [router])

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: fetchAccounts,
  })

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["portfolio-summary", selectedAccountId],
    queryFn: () => fetchPortfolioSummary(selectedAccountId),
  })

  const { data: sentiment } = useQuery({
    queryKey: ["market-sentiment"],
    queryFn: fetchMarketSentiment,
    staleTime: 1000 * 60 * 60,
  })

  const chartData = (() => {
    if (!summary) return []
    const cashSlice = summary.total_cash > 0
      ? [{ sector: "현금", value: summary.total_cash, pct: summary.cash_pct }]
      : []
    if (chartView === "ticker") {
      return [
        ...summary.ticker_weights.map((t) => ({ sector: t.name ?? t.ticker, value: t.value, pct: t.pct })),
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
        <h1 className="text-xl font-bold tracking-tight">Notefolio</h1>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {new Date().toLocaleDateString("ko-KR")}
        </span>
      </div>

      <AccountTabs
        accounts={accounts}
        selectedId={selectedAccountId}
        onSelect={(id) => {
          setSelectedAccountId(id)
          if (id !== null && chartView === "account") setChartView("sector")
        }}
      />

      {summaryLoading ? (
        <div className="h-32 rounded-2xl animate-pulse" style={{ backgroundColor: "var(--bg-card)" }} />
      ) : summary ? (
        <AssetSummary summary={summary} currency="USD" />
      ) : null}

      <div className="rounded-2xl p-5 shadow-sm"
        style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {selectedAccountId
              ? `${accounts.find((a) => a.id === selectedAccountId)?.name}`
              : "전체"}{" "}·{" "}
            {chartView === "sector" ? "섹터 비중" : chartView === "ticker" ? "종목 비중" : "계좌 비중"}
          </p>
          <div className="flex rounded-xl p-0.5 gap-0.5"
            style={{ backgroundColor: "var(--bg-input)" }}>
            {chartViewOptions.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setChartView(opt.key)}
                className="px-3 py-1 rounded-lg text-xs font-medium transition-colors"
                style={
                  chartView === opt.key
                    ? { backgroundColor: "var(--accent)", color: "white" }
                    : { color: "var(--text-muted)" }
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        {summaryLoading ? (
          <div className="h-48 rounded-xl animate-pulse" style={{ backgroundColor: "var(--bg-input)" }} />
        ) : (
          <SectorDonutChart data={chartData} />
        )}
      </div>

      {sentiment && <FearGreedGauge sentiment={sentiment} />}
    </main>
  )
}