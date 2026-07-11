"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchTimelineEvents, createTimelineEvent, deleteTimelineEvent } from "@/lib/api"
import { CalendarClock, Plus, X, Trash2, ExternalLink } from "lucide-react"

function AddEventModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [title, setTitle] = useState("")
  const [eventDate, setEventDate] = useState("")
  const [eventType, setEventType] = useState("EARNING")
  const [ticker, setTicker] = useState("")
  const [memo, setMemo] = useState("")

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      // 야후 파이낸스 / 인베스팅닷컴 스마트 링크 자동 생성
      let link = ""
      if (eventType === "EARNING" && ticker) link = `https://finance.yahoo.com/quote/${ticker.toUpperCase()}`
      if (eventType === "MACRO") link = `https://kr.investing.com/economic-calendar/`

      return createTimelineEvent({
        title,
        event_date: new Date(eventDate).toISOString(),
        event_type: eventType,
        ticker: ticker ? ticker.toUpperCase() : undefined,
        memo: memo || undefined,
        link
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timeline"] })
      onClose()
    },
    onError: (e: any) => alert(e.message)
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-black text-slate-900">새 일정 추가</h2>
          <button onClick={onClose} className="p-1.5 bg-slate-100 rounded-full text-slate-500"><X size={18}/></button>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-500 mb-1 block">유형</label>
          <div className="flex bg-slate-100 rounded-xl p-1">
            <button onClick={() => setEventType("EARNING")} className={`flex-1 py-2 rounded-lg text-xs font-bold ${eventType==="EARNING" ? "bg-white text-violet-600 shadow-sm" : "text-slate-500"}`}>실적발표</button>
            <button onClick={() => setEventType("MACRO")} className={`flex-1 py-2 rounded-lg text-xs font-bold ${eventType==="MACRO" ? "bg-white text-violet-600 shadow-sm" : "text-slate-500"}`}>매크로</button>
            <button onClick={() => setEventType("CUSTOM")} className={`flex-1 py-2 rounded-lg text-xs font-bold ${eventType==="CUSTOM" ? "bg-white text-violet-600 shadow-sm" : "text-slate-500"}`}>기타</button>
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-500 mb-1 block">일정 제목 *</label>
          <input className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl text-sm" placeholder="예: FOMC 금리결정" value={title} onChange={e=>setTitle(e.target.value)} />
        </div>

        {eventType === "EARNING" && (
          <div>
            <label className="text-xs font-bold text-slate-500 mb-1 block">티커 (선택)</label>
            <input className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl text-sm uppercase" placeholder="예: AAPL" value={ticker} onChange={e=>setTicker(e.target.value)} />
          </div>
        )}

        <div>
          <label className="text-xs font-bold text-slate-500 mb-1 block">날짜 *</label>
          <input type="date" className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl text-sm" value={eventDate} onChange={e=>setEventDate(e.target.value)} />
        </div>

        <div>
          <label className="text-xs font-bold text-slate-500 mb-1 block">메모 (나만의 뷰)</label>
          <textarea className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl text-sm h-20 resize-none" placeholder="이 일정에 대해 기록해두고 싶은 생각..." value={memo} onChange={e=>setMemo(e.target.value)} />
        </div>

        <button onClick={() => mutate()} disabled={isPending || !title || !eventDate} className="w-full py-3.5 bg-violet-600 text-white rounded-xl font-bold text-sm disabled:opacity-40">
          {isPending ? "저장 중..." : "일정 등록하기"}
        </button>
      </div>
    </div>
  )
}

function EventPopup({ event, onClose }: { event: any; onClose: () => void }) {
  const qc = useQueryClient()
  const { mutate } = useMutation({
    mutationFn: () => deleteTimelineEvent(event.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["timeline"] }); onClose() }
  })

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0">
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-xs font-bold text-violet-600 bg-violet-50 px-2 py-1 rounded-md inline-block mb-2">{event.event_type}</p>
            <h2 className="text-xl font-black text-slate-900">{event.title}</h2>
            <p className="text-sm text-slate-500 font-medium mt-1">{new Date(event.event_date).toLocaleDateString("ko-KR")}</p>
          </div>
          <button onClick={onClose} className="p-1.5 bg-slate-100 rounded-full text-slate-500"><X size={18}/></button>
        </div>

        {event.link && (
          <a href={event.link} target="_blank" rel="noreferrer" className="flex items-center justify-between w-full p-3 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors mb-4 group">
            <span className="text-sm font-bold text-slate-700">결과 바로 확인하기</span>
            <ExternalLink size={16} className="text-slate-400 group-hover:text-violet-600" />
          </a>
        )}

        {event.memo && (
          <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl mb-4">
            <p className="text-xs font-bold text-amber-600 mb-1">✍️ 나의 노트</p>
            <p className="text-sm text-slate-800 whitespace-pre-wrap">{event.memo}</p>
          </div>
        )}

        <button onClick={() => mutate()} className="flex items-center justify-center gap-1.5 w-full py-2.5 text-red-500 bg-red-50 rounded-xl text-xs font-bold hover:bg-red-100">
          <Trash2 size={14} /> 일정 삭제
        </button>
      </div>
    </div>
  )
}

export default function TimelinePage() {
  const [showAdd, setShowAdd] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null)
  const { data: events = [], isLoading } = useQuery({ queryKey: ["timeline"], queryFn: fetchTimelineEvents })

  return (
    <main className="max-w-lg mx-auto px-4 pt-6 pb-24 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800 tracking-tight">투자 타임라인</h1>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-1 bg-violet-600 hover:bg-violet-700 text-white px-3 py-2 rounded-xl text-xs font-bold shadow-sm transition-colors">
          <Plus size={14} /> 일정 추가
        </button>
      </div>

      <div className="relative pl-4 border-l-2 border-slate-100 space-y-6 mt-6">
        {isLoading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-20 bg-slate-100 rounded-2xl" />
            <div className="h-20 bg-slate-100 rounded-2xl" />
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <CalendarClock size={40} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm font-bold">등록된 일정이 없습니다</p>
          </div>
        ) : (
          events.map((ev: any) => {
            const today = new Date()
            const evDate = new Date(ev.event_date)
            const diffDays = Math.ceil((evDate.getTime() - today.getTime()) / (1000 * 3600 * 24))
            const isPast = diffDays < 0
            
            return (
              <div key={ev.id} className="relative cursor-pointer group" onClick={() => setSelectedEvent(ev)}>
                <div className={`absolute -left-[23px] top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white ${isPast ? 'bg-slate-300' : 'bg-violet-500 ring-4 ring-violet-50'}`} />
                <div className={`bg-white border p-4 rounded-2xl shadow-sm transition-all group-hover:shadow-md ${isPast ? 'border-slate-100 opacity-60' : 'border-slate-200'}`}>
                  <div className="flex justify-between items-center mb-1">
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${isPast ? 'bg-slate-100 text-slate-500' : 'bg-violet-50 text-violet-600'}`}>
                      {isPast ? '종료됨' : diffDays === 0 ? 'D-Day' : `D-${diffDays}`}
                    </span>
                    <span className="text-[11px] font-bold text-slate-400">{evDate.toLocaleDateString("ko-KR", { month: 'short', day: 'numeric' })}</span>
                  </div>
                  <h3 className={`font-bold ${isPast ? 'text-slate-500' : 'text-slate-800'}`}>
                    {ev.event_type === "EARNING" ? "🍎" : ev.event_type === "MACRO" ? "🏛️" : "📌"} {ev.title}
                  </h3>
                  {ev.memo && <p className="text-xs text-slate-500 mt-2 truncate">✍️ {ev.memo}</p>}
                </div>
              </div>
            )
          })
        )}
      </div>

      {showAdd && <AddEventModal onClose={() => setShowAdd(false)} />}
      {selectedEvent && <EventPopup event={selectedEvent} onClose={() => setSelectedEvent(null)} />}
    </main>
  )
}