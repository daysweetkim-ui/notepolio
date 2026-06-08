"use client"

import type { MarketSentiment } from "@/types"


// CNN API 영어 rating → 한국어 + 색상 매핑
const RATING_MAP: Record<string, { label: string; color: string }> = {
  "Extreme Fear":  { label: "극단적 공포", color: "#ef4444" },
  "Fear":          { label: "공포",        color: "#f97316" },
  "Neutral":       { label: "중립",        color: "#eab308" },
  "Greed":         { label: "탐욕",        color: "#84cc16" },
  "Extreme Greed": { label: "극단적 탐욕", color: "#10b981" },
}

function getLevel(classification: string) {
  return RATING_MAP[classification] ?? { label: classification, color: "#eab308" }
}

interface Props {
  sentiment: MarketSentiment
}

export default function FearGreedGauge({ sentiment }: Props) {
  const level = getLevel(sentiment.classification)
  const pct = sentiment.value

  return (
      <div className="rounded-2xl p-5 shadow-sm"
    style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
    <p className="text-xs mb-4" style={{ color: "var(--text-secondary)" }}>
      시장 심리 (CNN 공포/탐욕 지수)
    </p>

    <div className="relative h-3 rounded-full mb-4 overflow-hidden"
      style={{ backgroundColor: "var(--bg-input)" }}>
      <div className="absolute inset-0 rounded-full"
        style={{ background: "linear-gradient(to right, #ef4444, #f97316, #eab308, #84cc16, #10b981)" }} />
      <div className="absolute top-0 right-0 h-full rounded-r-full transition-all duration-700"
        style={{ width: `${100 - sentiment.value}%`, backgroundColor: "var(--bg-input)" }} />
      <div className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white shadow transition-all duration-700"
        style={{ left: `calc(${sentiment.value}% - 8px)`, backgroundColor: "var(--bg-card)" }} />
    </div>

    <div className="flex items-end justify-between">
      <div>
        <span className="text-4xl font-bold" style={{ color: level.color }}>
          {Math.round(sentiment.value)}
        </span>
        <span className="text-sm ml-2" style={{ color: "var(--text-muted)" }}>/ 100</span>
      </div>
      <span className="text-sm font-medium px-3 py-1 rounded-full"
        style={{ backgroundColor: level.color + "22", color: level.color }}>
        {level.label}
      </span>
    </div>
  </div>
)
}