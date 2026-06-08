"use client"

import type { Account } from "@/types"

interface Props {
  accounts: Account[]
  selectedId: number | null
  onSelect: (id: number | null) => void
}

export default function AccountTabs({ accounts, selectedId, onSelect }: Props) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
      <button
        onClick={() => onSelect(null)}
        className="shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors border"
        style={
          selectedId === null
            ? { backgroundColor: "var(--accent)", color: "white", borderColor: "var(--accent)" }
            : { backgroundColor: "var(--bg-card)", color: "var(--text-secondary)", borderColor: "var(--border)" }
        }
      >
        전체
      </button>
      {accounts.map((acc) => (
        <button
          key={acc.id}
          onClick={() => onSelect(acc.id)}
          className="shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors border"
          style={
            selectedId === acc.id
              ? { backgroundColor: "var(--accent)", color: "white", borderColor: "var(--accent)" }
              : { backgroundColor: "var(--bg-card)", color: "var(--text-secondary)", borderColor: "var(--border)" }
          }
        >
          {acc.name}
        </button>
      ))}
    </div>
  )
}