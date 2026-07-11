import axios from "axios"
import type { Account, PortfolioSummary, MarketSentiment, HoldingOut, HoldingCreate, TradeCreate, StockSearchResponse, TradesResponse } from "@/types"


const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
  timeout: 10000,
})
export default api
// 요청마다 토큰 자동 첨부
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token")
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// 401 응답 시 로그인 페이지로 이동
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("token")
      window.location.href = "/login"
    }
    return Promise.reject(err)
  }
)

export const fetchAccounts = async (): Promise<Account[]> => {
  const { data } = await api.get("/api/accounts")
  return data
}

export const fetchPortfolioSummary = async (
  accountId: number | null
): Promise<PortfolioSummary> => {
  const params = accountId ? { account_id: accountId } : {}
  const { data } = await api.get("/api/portfolio/summary", { params })
  return data
}

export const fetchMarketSentiment = async (): Promise<MarketSentiment> => {
  const { data } = await api.get("/api/market/sentiment")
  return data
}
export const searchStock = async (q: string): Promise<StockSearchResponse> => {
  const { data } = await api.get("/api/stocks/search", { params: { q } })
  return data
}

export const fetchHoldings = async (accountId: number | null): Promise<HoldingOut[]> => {
  const params = accountId ? { account_id: accountId } : {}
  const { data } = await api.get("/api/holdings", { params })
  return data
}

export const createHolding = async (body: HoldingCreate): Promise<HoldingOut> => {
  const { data } = await api.post("/api/holdings", body)
  return data
}

export const createTrade = async (body: TradeCreate) => {
  const { data } = await api.post("/api/trades", body)
  return data
}

export const fetchTrades = async ({
  accountId,
  tradeType,
  limit = 30,
  offset = 0,
}: {
  accountId: number | null
  tradeType: string | null
  limit?: number
  offset?: number
}): Promise<TradesResponse> => {
  const params: Record<string, unknown> = { limit, offset }
  if (accountId) params.account_id = accountId
  if (tradeType) params.trade_type = tradeType
  const { data } = await api.get("/api/trades", { params })
  return data
}

export const createAccount = async (body: {
  name: string
  account_type: string
  currency: string
  description?: string
}): Promise<Account> => {
  const { data } = await api.post("/api/accounts", body)
  return data
}

export const updateAccount = async (id: number, body: Partial<Account>): Promise<Account> => {
  const { data } = await api.put(`/api/accounts/${id}`, body)
  return data
}

export const deleteAccount = async (id: number): Promise<void> => {
  await api.delete(`/api/accounts/${id}`)
}

export const deleteHolding = async (id: number): Promise<void> => {
  await api.delete(`/api/holdings/${id}`)
}

export const updateCash = async (
  accountId: number,
  body: { amount: number; currency: string }
): Promise<void> => {
  await api.put(`/api/accounts/${accountId}/cash`, body)
}

export const deleteTrade = async (id: number): Promise<void> => {
  await api.delete(`/api/trades/${id}`)
}


// --- 스냅샷 ---
export async function createSnapshot(data: {
  total_asset: number;
  total_stock_buy: number;
  total_stock_eval: number;
  total_cash: number;
  memo?: string;
}) {
  const res = await api.post("/snapshots", data); 
  return res.data;
}

export async function fetchSnapshots() {
  const res = await api.get("/snapshots"); 
  return res.data;
}

// --- 타임라인 ---
export async function createTimelineEvent(data: {
  event_type: string;
  ticker?: string;
  title: string;
  event_date: string;
  memo?: string;
  link?: string;
}) {
  const res = await api.post("/timeline", data); 
  return res.data;
}

export async function fetchTimelineEvents() {
  const res = await api.get("/timeline"); 
  return res.data;
}

export async function deleteTimelineEvent(eventId: number) {
  const res = await api.delete(`/timeline/${eventId}`); 
  return res.data;
}