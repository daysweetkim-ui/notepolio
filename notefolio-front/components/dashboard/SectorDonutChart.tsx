"use client"

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts"
import type { SectorWeight } from "@/types"

const COLORS = ["#2563eb", "#0891b2", "#059669", "#d97706", "#dc2626", "#7c3aed", "#db2777", "#65a30d"]

interface Props {
  data: SectorWeight[]
}

export default function SectorDonutChart({ data }: Props) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-48 text-sm"
        style={{ color: "var(--text-muted)" }}>
        보유 종목이 없습니다
      </div>
    )
  }

  return (
    <div className="flex flex-col sm:flex-row gap-4 items-center">
      {/* 도넛 차트 */}
      <div className="w-full sm:w-56 shrink-0" style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={85}
              dataKey="value"
              nameKey="sector"
              paddingAngle={2}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => [
                typeof value === "number" ? "$" + value.toLocaleString("en-US", { maximumFractionDigits: 0 }) : value,
                name,
              ]}
              contentStyle={{
                backgroundColor: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: "12px",
                fontSize: "12px",
                color: "var(--text-primary)",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* 테이블 */}
      <div className="flex-1 w-full">
        <div className="space-y-1.5">
          {data.map((item, i) => (
            <div key={item.sector} className="flex items-center gap-2">
              {/* 색상 점 */}
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              />
              {/* 섹터명 */}
              <span className="text-xs flex-1 truncate" style={{ color: "var(--text-primary)" }}>
                {item.sector}
              </span>
              {/* 바 */}
              <div className="w-20 h-1.5 rounded-full overflow-hidden"
                style={{ backgroundColor: "var(--bg-input)" }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${item.pct}%`,
                    backgroundColor: COLORS[i % COLORS.length],
                  }}
                />
              </div>
              {/* 비중 */}
              <span className="text-xs font-semibold w-10 text-right"
                style={{ color: "var(--text-secondary)" }}>
                {item.pct.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}