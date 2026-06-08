"use client"

import { useState } from "react"
import { TrendingUp, Banknote, Wallet, ArrowLeftRight } from "lucide-react"
import type { PortfolioSummary } from "@/types"

// 간단한 환율 (실제로는 API에서 받아오는 게 좋지만 프론트 토글용 근사값)
const USD_TO_KRW = 1520

interface Props {
  summary: PortfolioSummary
  currency: string
}

export default function AssetSummary({ summary }: Props) {
  const [showKRW, setShowKRW] = useState(false)

  function fmt(usd: number) {
    if (showKRW) {
      return "₩" + Math.round(usd * USD_TO_KRW).toLocaleString("ko-KR")
    }
    return "$" + usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const cards = [
    {
      label: "총자산",
      value: fmt(summary.total_asset),
      icon: Wallet,
      color: "#2563eb",
      bg: "#dbeafe",
    },
    {
      label: "주식 평가액",
      value: fmt(summary.total_stock_value),
      icon: TrendingUp,
      color: "#16a34a",
      bg: "#dcfce7",
    },
    {
      label: "현금",
      value: fmt(summary.total_cash),
      sub: `${summary.cash_pct.toFixed(1)}%`,
      icon: Banknote,
      color: "#d97706",
      bg: "#fef3c7",
    },
  ]

  return (
    <div>
      {/* 통화 토글 */}
      <div className="flex justify-end mb-2">
        <button
          onClick={() => setShowKRW(!showKRW)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border"
          style={{
            backgroundColor: showKRW ? "var(--accent)" : "var(--bg-card)",
            color: showKRW ? "white" : "var(--text-secondary)",
            borderColor: showKRW ? "var(--accent)" : "var(--border)",
          }}
        >
          <ArrowLeftRight size={11} />
          {showKRW ? "KRW" : "USD"}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl p-5 shadow-sm"
            style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: card.bg }}>
                <card.icon size={14} style={{ color: card.color }} />
              </div>
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{card.label}</span>
            </div>
            <p className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
              {card.value}
            </p>
            {card.sub && (
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                현금 비중 {card.sub}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}