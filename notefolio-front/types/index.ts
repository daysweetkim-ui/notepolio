export interface Account {
  id: number
  name: string
  account_type: string
  currency: string
  cash_amount: number
  is_active: boolean
}

export interface SectorWeight {
  sector: string
  value: number
  pct: number
}

export interface TickerWeight {
  ticker: string
  name: string
  value: number
  pct: number
}

export interface PortfolioSummary {
  total_asset: number
  total_stock_value: number
  total_cash: number
  cash_pct: number
  sector_weights: SectorWeight[]
  ticker_weights: TickerWeight[]
  account_weights: SectorWeight[]
}

export interface MarketSentiment {
  indicator: string
  value: number
  classification: string
  cached_at: string
  source: string
}

export interface StockSearchResult {
  ticker: string
  name: string
  exchange: string
  sector: string | null
  current_price: number | null
  change_pct: number | null
}

export interface StockSearchResponse {
  source: string
  results: StockSearchResult[]
}

export interface PriceInfo {
  current_price: number | null
  change_pct: number | null
  market_cap: number | null
  shares_outstanding: number | null
  per: number | null
  forward_per: number | null
  psr: number | null
  eps: number | null
  week52_low_pct: number | null
  cached_at: string | null
}

export interface HoldingOut {
  id: number
  account_id: number
  ticker: string
  avg_price: number
  quantity: number
  memo: string | null
  created_at: string
  updated_at: string
  name: string | null
  sector: string | null
  industry: string | null
  exchange: string | null
  price_info: PriceInfo | null
  account_name?: string | null
}

export interface HoldingCreate {
  account_id: number
  ticker: string
  avg_price: number
  quantity: number
  memo?: string
}

export interface TradeCreate {
  holding_id: number
  account_id: number
  ticker: string
  trade_type: "BUY" | "SELL"
  quantity: number
  price: number
  memo?: string
  tags: string[]
  traded_at: string
}

export interface TradeOut {
  id: number
  holding_id: number
  account_id: number
  ticker: string
  trade_type: "BUY" | "SELL"
  quantity: number
  price: number
  realized_pnl: number | null
  memo: string | null
  tags: string[]
  traded_at: string
  created_at: string
}

export interface TradesResponse {
  total: number
  offset: number
  limit: number
  items: TradeOut[]
}