"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, LineChart, History, CalendarClock, Camera } from "lucide-react"

const tabs = [
  { href: "/",         label: "대시보드",      icon: LayoutDashboard },
  { href: "/holdings", label: "주식현황",      icon: LineChart },
  { href: "/trades",   label: "히스토리",      icon: History },
  { href: "/timeline", label: "타임라인",      icon: CalendarClock },
  { href: "/snapshots",label: "스냅샷",        icon: Camera },
]

export default function BottomNav() {
  const pathname = usePathname()

  // 로그인 화면에서는 하단 바를 숨김 처리합니다
  if (pathname === "/login") return null

  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 z-50 backdrop-blur border-t pb-safe"
      style={{ backgroundColor: "rgba(245,240,232,0.92)", borderColor: "var(--border)" }}
    >
      <ul className="flex max-w-2xl mx-auto px-1 py-1">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className="flex flex-col items-center justify-center gap-1 py-2 transition-colors"
                style={{ color: active ? "var(--accent)" : "var(--text-muted)" }}
              >
                <Icon size={20} />
                <span className={`text-[10px] ${active ? "font-bold" : "font-medium"}`}>
                  {label}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}