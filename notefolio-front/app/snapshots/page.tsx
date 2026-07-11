"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchSnapshots, createSnapshot, fetchPortfolioSummary } from "@/lib/api"
import { Camera, Plus, X } from "lucide-react"

function SnapshotModal({ onClose, summary }: { onClose: () => void, summary: any }) {
  const qc = useQueryClient()
  const [memo, setMemo] = useState("")

  const { mutate, isPending } = useMutation({
    mutationFn: () => createSnapshot({
      total_asset: summary.total_asset,
      total_stock_buy: summary.total_stock_buy,
      total_stock_eval: summary.total_stock_value,
      total_cash: summary.total_cash,
      memo
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["snapshots"] })
      onClose()
    }
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-black text-slate-900">결산 스냅샷 기록하기</h2>
          <button onClick={onClose} className="p-1.5 bg-slate-100 rounded-full text-slate-500"><X size={18}/></button>
        </div>
        
        <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl text-center">
          <p className="text-[10px] font-bold text-slate-400 mb-1">현재 총 자산</p>
          <p className="text-2xl font-black text-slate-800">₩{Math.round(summary.total_asset).toLocaleString()}</p>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-500 mb-1 block">이 스냅샷을 남기는 이유 (메모)</label>
          <textarea 
            className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl text-sm h-24 resize-none focus:ring-2 focus:ring-violet-500 outline-none" 
            placeholder="예: 24년 2분기 마무리 결산. 엔비디아 비중 축소 후 현금 확보함." 
            value={memo} 
            onChange={e=>setMemo(e.target.value)} 
          />
        </div>

        <button onClick={() => mutate()} disabled={isPending} className="w-full py-3.5 bg-violet-600 text-white rounded-xl font-bold text-sm disabled:opacity-40">
          {isPending ? "저장 중..." : "찰칵! 기록 남기기"}
        </button>
      </div>
    </div>
  )
}

export default function SnapshotsPage() {
  const [showModal, setShowModal] = useState(false)
  const { data: snapshots = [], isLoading } = useQuery({ queryKey: ["snapshots"], queryFn: fetchSnapshots })
  const { data: summary } = useQuery<any>({ queryKey: ["portfolio-summary", null], queryFn: () => fetchPortfolioSummary(null) })

  return (
    <main className="max-w-lg mx-auto px-4 pt-6 pb-24 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800 tracking-tight">자산 결산 다이어리</h1>
        <button 
          onClick={() => setShowModal(true)} 
          disabled={!summary}
          className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white px-3 py-2 rounded-xl text-xs font-bold shadow-sm transition-colors disabled:opacity-50"
        >
          <Camera size={14} /> 스냅샷 찍기
        </button>
      </div>

      <div className="space-y-4">
        {isLoading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-32 bg-slate-100 rounded-2xl" />
            <div className="h-32 bg-slate-100 rounded-2xl" />
          </div>
        ) : snapshots.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <Camera size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-bold mb-1">아직 남겨진 스냅샷이 없습니다.</p>
            <p className="text-xs">우측 상단 버튼을 눌러 현재 자산을 영구 기록해 보세요!</p>
          </div>
        ) : (
          snapshots.map((snap: any) => (
            <div key={snap.id} className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
              <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
                <span className="text-xs font-black text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg">
                  {new Date(snap.created_at).toLocaleDateString("ko-KR", { year: 'numeric', month: 'long', day: 'numeric' })}
                </span>
                <span className="text-lg font-black text-slate-900">₩{Math.round(snap.total_asset).toLocaleString()}</span>
              </div>
              
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-slate-50 rounded-xl p-2.5 text-center">
                  <p className="text-[10px] font-bold text-slate-400 mb-0.5">매입 원금</p>
                  <p className="text-xs font-black text-slate-700">₩{Math.round(snap.total_stock_buy).toLocaleString()}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-2.5 text-center">
                  <p className="text-[10px] font-bold text-slate-400 mb-0.5">주식 평가액</p>
                  <p className="text-xs font-black text-slate-700">₩{Math.round(snap.total_stock_eval).toLocaleString()}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-2.5 text-center">
                  <p className="text-[10px] font-bold text-slate-400 mb-0.5">현금 잔고</p>
                  <p className="text-xs font-black text-slate-700">₩{Math.round(snap.total_cash).toLocaleString()}</p>
                </div>
              </div>

              {snap.memo && (
                <div className="bg-amber-50/50 border border-amber-100/50 p-3.5 rounded-xl">
                  <p className="text-xs text-slate-700 leading-relaxed">"{snap.memo}"</p>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {showModal && summary && <SnapshotModal onClose={() => setShowModal(false)} summary={summary} />}
    </main>
  )
}