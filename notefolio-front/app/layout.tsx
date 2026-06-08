import type { Metadata, Viewport } from "next"
import { Geist } from "next/font/google"
import Providers from "./providers"
import BottomNav from "@/components/BottomNav"
import "./globals.css"

const geist = Geist({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Notefolio",
  description: "개인 투자자를 위한 자산 관리 앱",
  manifest: "/manifest.json",
}

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body className={`${geist.className} min-h-screen`}
            style={{ backgroundColor: "var(--bg)", color: "var(--text-primary)" }}>
        {/* 💡 빼먹었던 알맹이와 세팅들을 다시 집어넣었습니다! */}
        <Providers>
          {children}
          <BottomNav />
        </Providers>
      </body>
    </html>
  )
}