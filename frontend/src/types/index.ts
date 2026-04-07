// ============================================================
// Core Domain Types
// ============================================================

export interface Seller {
  id: string
  seller_id: string
  seller_name: string
  marketplace: string
  store_url: string
  total_skus: number
  categories: string[]
  avg_rating: number
  avg_price: number
  is_target: boolean
  created_at: string
  updated_at: string
}

export interface SKU {
  id: string
  sku_id: string
  ean: string | null
  title: string
  category: string
  subcategory: string
  seller_id: string
  seller_name: string
  price_current: number
  price_original: number | null
  rating: number
  review_count: number
  recent_reviews_30d: number
  sales_rank: number | null
  badges: string[]
  marketplace: string
  last_updated: string
  estimated_monthly_sales: number
  stock_status: string
  created_at: string
}

export interface PriceHistoryPoint {
  id: string
  sku_id: string
  seller_id: string
  price: number
  recorded_at: string
  marketplace: string
}

// ============================================================
// Competitor Types
// ============================================================

export interface CompetitorEntry {
  seller_id: string
  seller_name: string
  overlap_count: number
  overlap_pct: number
  relationship: string
  shared_skus: string[]
}

export interface CompetitorResult {
  target_seller_id: string
  total_target_skus: number
  direct_competitors: CompetitorEntry[]
  indirect_competitors: CompetitorEntry[]
}

export interface PortfolioGapItem {
  sku_id: string
  title: string
  category: string
  price: number
  competitor_seller_id: string
  competitor_seller_name: string
  estimated_monthly_sales: number
  opportunity_score: number
  marketplace: string
}

export interface PortfolioGapResult {
  seller_id: string
  gaps: PortfolioGapItem[]
  total_gaps: number
}

// ============================================================
// Dashboard Types
// ============================================================

export interface DashboardKPIs {
  total_skus: number
  total_estimated_revenue: number
  avg_price: number
  avg_rating: number
  direct_competitors_count: number
  indirect_competitors_count: number
  price_alerts_count: number
  competitiveness_index: number
  top_category: string
  revenue_vs_last_month_pct: number
}

export interface CategoryBreakdown {
  category: string
  sku_count: number
  avg_price: number
  avg_rating: number
  total_revenue_est: number
}

export interface DashboardData {
  seller_id: string
  seller_name: string
  marketplace: string
  kpis: DashboardKPIs
  category_breakdown: CategoryBreakdown[]
  top_skus: SKU[]
  recent_alerts: AlertItem[]
}

// ============================================================
// Alert Types
// ============================================================

export interface AlertItem {
  alert_type: string
  sku_id: string
  seller_id: string
  severity: 'low' | 'medium' | 'high'
  message: string
  detected_at: string
}

export interface DashboardAlerts {
  seller_id: string
  price_alerts: AlertItem[]
  significant_price_changes: PriceChangeAlert[]
  market_alerts: MarketAlert[]
}

export interface PriceChangeAlert {
  sku_id: string
  title: string
  seller_name: string
  old_price: number
  new_price: number
  change_pct: number
  direction: 'up' | 'down'
  detected_at: string
}

export interface MarketAlert {
  alert_type: string
  title: string
  category: string
  seller_name: string
  adhesion_score: number
  severity: string
  message: string
}

// ============================================================
// SKU List / Pagination
// ============================================================

export interface PaginatedSKUs {
  total: number
  page: number
  limit: number
  pages: number
  items: SKU[]
}

export interface SkuFilters {
  seller_id?: string
  category?: string
  marketplace?: string
  min_price?: number
  max_price?: number
  page?: number
  limit?: number
}

// ============================================================
// Revenue Types
// ============================================================

export interface SkuRevenue {
  sku_id: string
  title: string
  category: string
  price: number
  estimated_monthly_sales: number
  estimated_revenue: number
  revenue_pct: number
}

export interface CategoryRevenue {
  category: string
  total_revenue: number
  sku_count: number
  revenue_pct: number
}

export interface RevenueData {
  seller_id: string
  period_days: number
  total_estimated_revenue: number
  by_sku: SkuRevenue[]
  by_category: CategoryRevenue[]
  top_revenue_skus?: SkuRevenue[]
}

export interface RevenueComparison {
  period_days: number
  sellers: {
    seller_id: string
    seller_name: string
    total_revenue: number
    monthly_breakdown: MonthlyRevenue[]
  }[]
}

export interface MonthlyRevenue {
  year: number
  month: number
  revenue: number
  units: number
}

// ============================================================
// Top Products / Rankings
// ============================================================

export interface TopProduct {
  sku_id: string
  title: string
  category: string
  price_current: number
  estimated_monthly_sales: number
  adhesion_score: number
  rating: number
  review_count: number
  seller_name: string
  marketplace: string
}

export interface TopProductsResult {
  total: number
  items: TopProduct[]
}

export interface RankingFilters {
  limit?: number
  category?: string
  marketplace?: string
}

// ============================================================
// Trends Types
// ============================================================

export interface TrendProduct {
  sku_id: string
  title: string
  category: string
  price_current: number
  estimated_monthly_sales: number
  growth_ratio: number
  adhesion_score: number
  seller_name: string
  marketplace: string
}

export interface TrendsResult {
  total: number
  days: number
  items: TrendProduct[]
}

export interface MonthlyRanking {
  seller_id: string
  year: number
  month: number
  ranking: MonthlyRankItem[]
}

export interface MonthlyRankItem {
  rank: number
  sku_id: string
  title: string
  category: string
  price: number
  estimated_monthly_sales: number
  revenue: number
  seller_name: string
}

// ============================================================
// Matrix Types
// ============================================================

export interface MatrixPoint {
  sku_id: string
  title: string
  category: string
  price: number
  volume: number
  revenue: number
  rating: number
  seller_name: string
}

export interface MatrixResult {
  seller_id: string | null
  category: string | null
  days: number
  data: MatrixPoint[]
}

export interface MatrixFilters {
  seller_id?: string
  category?: string
  days?: number
}

export interface HeatmapEntry {
  category: string
  seller_name: string
  avg_price: number
  category_avg_price: number
  price_competitiveness_pct: number
  sku_count: number
  position: 'below_market' | 'at_market' | 'above_market'
}

export interface HeatmapResult {
  total_entries: number
  data: HeatmapEntry[]
}

// ============================================================
// Analysis Job Types
// ============================================================

export interface JobResponse {
  job_id: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  progress: number
  step?: string | null
  result: JobResult | null
  error: string | null
}

export interface JobResult {
  seller_id: string
  seller_name: string
  marketplace: string
  total_skus: number
}

// ============================================================
// Store Comparison Types
// ============================================================

export interface ComparisonSellerSummary {
  seller_id: string
  seller_name: string
  total_skus: number
  total_estimated_revenue: number
  avg_price: number
  categories: string[]
  top_skus: {
    sku_id: string
    title: string
    category: string
    price: number
    estimated_monthly_sales: number
    estimated_monthly_revenue: number
  }[]
}

export interface ComparisonOverlap {
  shared_sku_count: number
  shared_ean_count: number
  overlap_pct_a: number
  overlap_pct_b: number
  unique_to_a: number
  unique_to_b: number
  shared_categories: string[]
}

export interface ComparisonCategoryRow {
  category: string
  a_skus: number
  b_skus: number
  a_revenue: number
  b_revenue: number
  a_avg_price: number
  b_avg_price: number
}

export interface StoreComparisonResult {
  seller_a: ComparisonSellerSummary
  seller_b: ComparisonSellerSummary
  overlap: ComparisonOverlap
  category_comparison: ComparisonCategoryRow[]
}

// ============================================================
// App State Types
// ============================================================

export type Theme = 'dark' | 'light'
export type Period = '7d' | '15d' | '30d' | '60d' | '90d'

export interface Filters {
  period: Period
  category: string | null
  minPrice: number | null
  maxPrice: number | null
  marketplace: string | null
}
