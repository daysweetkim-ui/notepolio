"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, LineChart, History } from "lucide-react"

const tabs = [
  { href: "/",         label: "대시보드",     icon: LayoutDashboard },
  { href: "/holdings", label: "내 주식현황",   icon: LineChart },
  { href: "/trades",   label: "매매 히스토리", icon: History },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 backdrop-blur border-t"
  style={{ backgroundColor: "rgba(245,240,232,0.92)", borderColor: "var(--border)" }}>
  <ul className="flex max-w-2xl mx-auto">
    {tabs.map(({ href, label, icon: Icon }) => {
      const active = pathname === href
      return (
        <li key={href} className="flex-1">
          <Link
            href={href}
            className="flex flex-col items-center gap-1 py-3 text-xs transition-colors"
            style={{ color: active ? "var(--accent)" : "var(--text-muted)" }}
          >
            <Icon size={20} />
            {label}
          </Link>
        </li>
      )
    })}
  </ul>
</nav>
  )
}