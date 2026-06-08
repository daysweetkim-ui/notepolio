"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import api from "@/lib/api"

export default function LoginPage() {
  const router = useRouter()
  const [code, setCode] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    if (!code.trim()) return
    setLoading(true)
    setError("")
    try {
      const { data } = await api.post("/api/auth/login", { invite_code: code.trim() })
      localStorage.setItem("token", data.access_token)
      localStorage.setItem("user_name", data.name)
      router.push("/")
    } catch {
      setError("유효하지 않은 초대 코드입니다.")
    } finally {
      setLoading(false)
    }
  }

  return (
  <main className="min-h-screen flex items-center justify-center px-4"
    style={{ backgroundColor: "#f5f0e8" }}>
    <div className="w-full max-w-sm">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold tracking-tight mb-2"
          style={{ color: "#1a1814" }}>
          Notefolio
        </h1>
        <p className="text-sm" style={{ color: "#6b6560" }}>
          초대 코드를 입력해 시작하세요
        </p>
      </div>

      <div className="space-y-3">
        <input
          className="w-full rounded-2xl px-5 py-4 text-sm outline-none text-center tracking-widest text-lg"
          style={{
            backgroundColor: "#ffffff",
            border: "1px solid #ddd8ce",
            color: "#1a1814",
          }}
          placeholder="초대 코드"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          autoComplete="off"
        />
        {error && (
          <p className="text-xs text-center" style={{ color: "#dc2626" }}>{error}</p>
        )}
        <button
          onClick={handleLogin}
          disabled={!code.trim() || loading}
          className="w-full rounded-2xl py-4 font-semibold transition-colors disabled:opacity-40"
          style={{ backgroundColor: "#2563eb", color: "white" }}
        >
          {loading ? "확인 중..." : "시작하기"}
        </button>
      </div>
    </div>
  </main>
)
}