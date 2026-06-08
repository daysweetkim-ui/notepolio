"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchAccounts, createAccount, updateAccount, deleteAccount, updateCash } from "@/lib/api"
import type { Account } from "@/types"
import {
  X, Plus, Pencil, Trash2, ChevronDown,
  Wallet, Check,
} from "lucide-react"

// ── 계좌 타입 옵션 ────────────────────────────────────────

const ACCOUNT_TYPES = ["주식", "연금", "ISA", "해외주식", "가상자산", "기타"]
const CURRENCIES    = ["USD", "KRW", "EUR", "JPY"]

// ── 계좌 폼 (등록 / 수정 공용) ────────────────────────────

function AccountForm({
  initial,
  onSubmit,
  onCancel,
  isPending,
}: {
  initial?: Partial<Account>
  // 💡 여기서 description 제거됨
  onSubmit: (data: { name: string; account_type: string; currency: string; initial_cash: number }) => void
  onCancel: () => void
  isPending: boolean
}) {
  const [name, setName]               = useState(initial?.name ?? "")
  const [accountType, setAccountType] = useState(initial?.account_type ?? "주식")
  const [currency, setCurrency]       = useState(initial?.currency ?? "USD")

  const isEdit = !!initial?.id
  const [initialCash, setInitialCash] = useState(0)

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
      {/* 계좌명 */}
      <div>
        <label className="text-xs font-bold text-slate-600 mb-1.5 block">계좌명 *</label>
        <input
          className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-violet-500 placeholder:text-slate-400"
          placeholder="예: 미국주식 계좌, 연금 IRP"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      {/* 계좌 유형 */}
      <div>
        <label className="text-xs font-bold text-slate-600 mb-1.5 block">계좌 유형 *</label>
        <div className="relative">
          <select
            className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-violet-500 appearance-none cursor-pointer"
            value={accountType}
            onChange={(e) => setAccountType(e.target.value)}
          >
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* 기준 통화 */}
      <div>
        <label className="text-xs font-bold text-slate-600 mb-1.5 block">기준 통화</label>
        <div className="flex gap-2">
          {CURRENCIES.map((c) => (
            <button
              key={c}
              onClick={() => setCurrency(c)}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${
                currency === c
                  ? "bg-violet-500 text-white shadow-md"
                  : "bg-white border border-slate-300 text-slate-600 hover:border-violet-300"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* 잔고 입력 */}
      <div>
         <label className="text-xs font-bold text-slate-600 mb-1.5 block">초기 잔고 (선택)</label>
          <input
            type="number"
            className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-violet-500 placeholder:text-slate-400"
            placeholder="0"
           value={initialCash || ""}
           onChange={(e) => setInitialCash(parseFloat(e.target.value) || 0)}
         />
       </div>

      {/* 버튼 */}
      <div className="flex gap-2 pt-2">
        <button
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl bg-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-300 transition-colors"
        >
          취소
        </button>
        <button
          // 💡 여기서 description 전송 제거됨
          onClick={() => onSubmit({ name, account_type: accountType, currency, initial_cash: initialCash })}
          disabled={!name.trim() || isPending}
          className="flex-1 py-2.5 rounded-xl bg-violet-500 hover:bg-violet-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold transition-colors flex items-center justify-center gap-1.5 shadow-md"
        >
          <Check size={16} />
          {isPending ? "저장 중..." : isEdit ? "수정 완료" : "계좌 등록"}
        </button>
      </div>
    </div>
  )
}

// ── 계좌 아이템 ───────────────────────────────────────────

function AccountItem({
  account,
  onEdit,
  onDelete,
}: {
  account: Account
  onEdit: (a: Account) => void
  onDelete: (id: number) => void
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-sm hover:shadow-md transition-shadow">
      {/* 아이콘 */}
      <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
        <Wallet size={18} className="text-violet-600" />
      </div>

      {/* 정보 */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-900 truncate">{account.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-slate-500">{account.account_type}</span>
          <span className="text-slate-300">·</span>
          <span className="text-xs text-slate-500">{account.currency}</span>
          <span className="text-slate-300">·</span>
          <span className="text-xs font-semibold text-slate-700">
            현금 ${account.cash_amount.toLocaleString()}
          </span>
        </div>
      </div>

      {/* 수정 / 삭제 버튼 */}
      <div className="flex gap-1.5 shrink-0">
        <button
          onClick={() => onEdit(account)}
          className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
        >
          <Pencil size={14} className="text-slate-600" />
        </button>
        <button
          onClick={() => onDelete(account.id)}
          className="w-8 h-8 rounded-xl bg-red-50 hover:bg-red-100 flex items-center justify-center transition-colors"
        >
          <Trash2 size={14} className="text-red-500" />
        </button>
      </div>
    </div>
  )
}

// ── 메인 모달 ─────────────────────────────────────────────

export default function AccountModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [mode, setMode] = useState<"list" | "add" | "edit">("list")
  const [editTarget, setEditTarget] = useState<Account | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: fetchAccounts,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["accounts"] })
    qc.invalidateQueries({ queryKey: ["portfolio-summary"] })
  }

  const { mutate: addAccount, isPending: addPending } = useMutation({
  // 💡 여기서 description 제거됨
  mutationFn: async (data: { name: string; account_type: string; currency: string; initial_cash: number }) => {
    const { initial_cash, ...body } = data
    const account = await createAccount(body)
    if (initial_cash > 0) {
      await updateCash(account.id, { amount: initial_cash, currency: body.currency })
    }
    return account
  },
  onSuccess: () => { invalidate(); setMode("list") },
})

  const { mutate: editAccount, isPending: editPending } = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Account> }) =>
      updateAccount(id, data),
    onSuccess: () => { invalidate(); setMode("list"); setEditTarget(null) },
  })

  const { mutate: removeAccount } = useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => { invalidate(); setDeleteConfirmId(null) },
  })

  const handleEdit = (account: Account) => {
    setEditTarget(account)
    setMode("edit")
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* 딤 배경 */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* 💡 전체 모달 배경 화이트(bg-white) & 텍스트 블랙(text-slate-900) */}
      <div className="relative w-full max-w-lg bg-white text-slate-900 rounded-t-3xl sm:rounded-3xl p-6 max-h-[85vh] overflow-y-auto shadow-2xl">
        {/* 모바일용 상단 핸들 (밝은 테마에 맞게 회색으로 변경) */}
        <div className="w-10 h-1.5 bg-slate-200 rounded-full mx-auto mb-5 sm:hidden" />

        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-black text-slate-900">계좌 관리</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 p-1.5 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* 계좌 목록 */}
        {mode === "list" && (
          <div className="space-y-3">
            {accounts.length === 0 ? (
              <div className="text-center py-10 bg-slate-50 rounded-2xl border border-slate-100 mt-2">
                <Wallet size={32} className="mx-auto text-slate-300 mb-2" />
                <p className="text-slate-500 font-medium text-sm">등록된 계좌가 없습니다</p>
              </div>
            ) : (
              accounts.map((acc) => (
                <div key={acc.id}>
                  <AccountItem
                    account={acc}
                    onEdit={handleEdit}
                    onDelete={(id) => setDeleteConfirmId(id)}
                  />
                  {/* 삭제 확인 창 */}
                  {deleteConfirmId === acc.id && (
                    <div className="mt-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center justify-between shadow-sm">
                      <p className="text-xs font-bold text-red-600">보유 종목도 함께 삭제됩니다. 정말 삭제할까요?</p>
                      <div className="flex gap-2 ml-3 shrink-0">
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="text-xs font-bold text-slate-500 hover:text-slate-700 px-2 py-1"
                        >
                          취소
                        </button>
                        <button
                          onClick={() => removeAccount(acc.id)}
                          className="text-xs font-bold bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg transition-colors shadow-sm"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}

            {/* 계좌 추가 버튼 */}
            <button
              onClick={() => setMode("add")}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 text-slate-600 font-bold hover:bg-slate-100 hover:border-slate-400 hover:text-slate-800 transition-all text-sm mt-4"
            >
              <Plus size={18} />
              새 계좌 추가
            </button>
          </div>
        )}

        {/* 계좌 등록 폼 */}
        {mode === "add" && (
          <AccountForm
            onSubmit={(data) => addAccount(data)}
            onCancel={() => setMode("list")}
            isPending={addPending}
          />
        )}

        {/* 계좌 수정 폼 */}
        {mode === "edit" && editTarget && (
          <AccountForm
            initial={editTarget}
            onSubmit={(data) =>
              editAccount({ id: editTarget.id, data })
            }
            onCancel={() => { setMode("list"); setEditTarget(null) }}
            isPending={editPending}
          />
        )}
      </div>
    </div>
  )
}