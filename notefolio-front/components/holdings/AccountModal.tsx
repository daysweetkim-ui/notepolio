"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchAccounts, createAccount, updateAccount, deleteAccount, updateCash } from "@/lib/api"
import type { Account } from "@/types"
import { X, Plus, Pencil, Trash2, Wallet, Check } from "lucide-react"

const ACCOUNT_TYPES = ["주식", "연금", "ISA", "해외주식", "가상자산", "기타"]

function AccountForm({
  initial,
  onSubmit,
  onCancel,
  isPending,
}: {
  initial?: Partial<Account>
  onSubmit: (data: { name: string; account_type: string; currency: string; initial_cash: number }) => void
  onCancel: () => void
  isPending: boolean
}) {
  const [name, setName]               = useState(initial?.name ?? "")
  const [accountType, setAccountType] = useState(initial?.account_type ?? "주식")
  const currency = "KRW"
  const isEdit = !!initial?.id
  const [initialCash, setInitialCash] = useState(initial?.cash_amount ? initial.cash_amount.toString() : "")

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
      <div>
        <label className="text-xs font-bold text-slate-600 mb-1.5 block">계좌명 *</label>
        <input className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-violet-500 placeholder:text-slate-400" placeholder="예: 미국주식 계좌, 연금 IRP" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="text-xs font-bold text-slate-600 mb-1.5 block">계좌 유형 *</label>
        <select className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-violet-500 cursor-pointer" value={accountType} onChange={(e) => setAccountType(e.target.value)}>
          {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div>
         <label className="text-xs font-bold text-slate-600 mb-1.5 block">초기 잔고 (원화 ₩)</label>
          <input type="text" inputMode="decimal" className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-violet-500 placeholder:text-slate-400" placeholder="0" value={initialCash ? Number(initialCash.replace(/,/g, "")).toLocaleString() : ""} onChange={(e) => { const raw = e.target.value.replace(/,/g, ""); if (!isNaN(Number(raw))) setInitialCash(raw) }} />
       </div>
      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-xl bg-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-300">취소</button>
        <button type="button" onClick={() => onSubmit({ name, account_type: accountType, currency, initial_cash: initialCash ? parseFloat(initialCash.replace(/,/g, "")) : 0 })} disabled={!name.trim() || isPending} className="flex-1 py-2.5 rounded-xl bg-violet-500 hover:bg-violet-600 text-white text-sm font-bold transition-colors flex items-center justify-center gap-1.5 shadow-md">
          <Check size={16} /> {isPending ? "저장 중..." : isEdit ? "수정 완료" : "계좌 등록"}
        </button>
      </div>
    </div>
  )
}

export default function AccountModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [mode, setMode] = useState<"list" | "add" | "edit">("list")
  const [editTarget, setEditTarget] = useState<Account | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)

  const { data: accounts = [] } = useQuery({ queryKey: ["accounts"], queryFn: fetchAccounts })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["accounts"] })
    qc.invalidateQueries({ queryKey: ["portfolio-summary"] })
  }

  const { mutate: addAccount, isPending: addPending } = useMutation({
    mutationFn: async (data: { name: string; account_type: string; currency: string; initial_cash: number }) => {
      const { initial_cash, ...body } = data
      const account = await createAccount(body)
      if (initial_cash > 0) { await updateCash(account.id, { amount: initial_cash, currency: body.currency }) }
      return account
    },
    onSuccess: () => { invalidate(); setMode("list") },
    onError: (err: any) => alert(`계좌 등록 실패: ${err.response?.data?.detail || err.message}`)
  })

  const { mutate: editAccount, isPending: editPending } = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Account> }) => updateAccount(id, data),
    onSuccess: () => { invalidate(); setMode("list"); setEditTarget(null) },
    onError: (err: any) => alert(`계좌 수정 실패: ${err.response?.data?.detail || err.message}`)
  })

  const { mutate: removeAccount } = useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => { invalidate(); setDeleteConfirmId(null) },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white text-slate-900 rounded-3xl p-5 sm:p-6 max-h-[85vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-black text-slate-900">계좌 관리</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 bg-slate-100 p-1.5 rounded-full"><X size={20} /></button>
        </div>

        {mode === "list" && (
          <div className="space-y-3">
            {accounts.length === 0 ? (
              <div className="text-center py-10 bg-slate-50 rounded-2xl border border-slate-100 mt-2"><p className="text-slate-500 font-medium text-sm">등록된 계좌가 없습니다</p></div>
            ) : (
              accounts.map((acc) => (
                <div key={acc.id} className="bg-white border border-slate-200 rounded-2xl px-4 py-3.5 flex items-center justify-between shadow-sm">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{acc.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{acc.account_type} · 현금 ₩{acc.cash_amount.toLocaleString()}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => { setEditTarget(acc); setMode("edit") }} className="text-xs px-2.5 py-1.5 bg-slate-100 rounded-xl font-bold text-slate-600">수정</button>
                    <button onClick={() => setDeleteConfirmId(acc.id)} className="text-xs px-2.5 py-1.5 bg-red-50 rounded-xl font-bold text-red-500">삭제</button>
                  </div>
                  {deleteConfirmId === acc.id && (
                    <div className="absolute inset-x-6 bottom-6 bg-white border border-slate-200 p-4 rounded-2xl shadow-xl flex items-center justify-between">
                      <p className="text-xs font-bold text-red-600">계좌를 삭제하시겠습니까?</p>
                      <div className="flex gap-2">
                        <button onClick={() => setDeleteConfirmId(null)} className="text-xs font-bold text-slate-500">취소</button>
                        <button onClick={() => removeAccount(acc.id)} className="text-xs font-bold bg-red-500 text-white px-3 py-1.5 rounded-xl">삭제</button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
            <button onClick={() => setMode("add")} className="w-full py-3.5 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 text-slate-600 font-bold hover:bg-slate-100 text-sm mt-4">+ 새 계좌 추가</button>
          </div>
        )}

        {mode === "add" && <AccountForm onSubmit={(data) => addAccount(data)} onCancel={() => setMode("list")} isPending={addPending} />}
        {mode === "edit" && editTarget && <AccountForm initial={editTarget} onSubmit={(data) => editAccount({ id: editTarget.id, data })} onCancel={() => { setMode("list"); setEditTarget(null) }} isPending={editPending} />}
      </div>
    </div>
  )
}