import client from './client'
import type {
  Seller,
  SKU,
  PaginatedSKUs,
  SkuFilters,
  CompetitorResult,
  PortfolioGapResult,
  DashboardData,
  DashboardAlerts,
  TopProductsResult,
  RankingFilters,
  RevenueData,
  RevenueComparison,
  TrendsResult,
  MonthlyRanking,
  MatrixResult,
  MatrixFilters,
  HeatmapResult,
  JobResponse,
  PriceHistoryPoint,
} from '../types'

// ============================================================
// Analysis Jobs
// ============================================================

export const startAnalysis = (url: string): Promise<JobResponse> =>
  client.post<JobResponse>('/analyze', { url }).then((r) => r.data)

export const getJobStatus = (jobId: string): Promise<JobResponse> =>
  client.get<JobResponse>(`/jobs/${jobId}`).then((r) => r.data)

// ============================================================
// Sellers
// ============================================================

export const getSellers = (): Promise<Seller[]> =>
  client.get<Seller[]>('/sellers').then((r) => r.data)

export const getSeller = (sellerId: string): Promise<Seller> =>
  client.get<Seller>(`/sellers/${sellerId}`).then((r) => r.data)

// ============================================================
// Competitors
// ============================================================

export const getCompetitors = (sellerId: string): Promise<CompetitorResult> =>
  client.get<CompetitorResult>(`/competitors/${sellerId}`).then((r) => r.data)

export const getPortfolioGap = (sellerId: string): Promise<PortfolioGapResult> =>
  client.get<PortfolioGapResult>(`/competitors/${sellerId}/gap`).then((r) => r.data)

// ============================================================
// SKUs
// ============================================================

export const getSkus = (params: SkuFilters): Promise<PaginatedSKUs> =>
  client.get<PaginatedSKUs>('/skus', { params }).then((r) => r.data)

export const getSku = (skuId: string): Promise<SKU> =>
  client.get<SKU>(`/skus/${skuId}`).then((r) => r.data)

export const getSkuPriceHistory = (
  skuId: string,
  days = 30
): Promise<{ sku_id: string; days: number; data_points: number; history: PriceHistoryPoint[] }> =>
  client.get(`/skus/${skuId}/price-history`, { params: { days } }).then((r) => r.data)

export const getSkuCompetitors = (skuId: string) =>
  client.get(`/skus/${skuId}/competitors`).then((r) => r.data)

// ============================================================
// Dashboard
// ============================================================

export const getDashboard = (sellerId: string): Promise<DashboardData> =>
  client.get<DashboardData>(`/dashboard/${sellerId}`).then((r) => r.data)

export const getDashboardAlerts = (sellerId: string): Promise<DashboardAlerts> =>
  client.get<DashboardAlerts>(`/dashboard/${sellerId}/alerts`).then((r) => r.data)

// ============================================================
// Rankings
// ============================================================

export const getTopProducts = (params: RankingFilters): Promise<TopProductsResult> =>
  client.get<TopProductsResult>('/rankings/top-products', { params }).then((r) => r.data)

export const getAdhesionScores = (params: RankingFilters) =>
  client.get('/rankings/adhesion', { params }).then((r) => r.data)

// ============================================================
// Revenue
// ============================================================

export const getRevenue = (sellerId: string, period = 'monthly'): Promise<RevenueData> =>
  client.get<RevenueData>(`/revenue/${sellerId}`, { params: { period } }).then((r) => r.data)

export const compareRevenue = (sellerIds: string[], period = 'monthly'): Promise<RevenueComparison> =>
  client
    .get<RevenueComparison>('/revenue/compare', {
      params: { seller_ids: sellerIds.join(','), period },
    })
    .then((r) => r.data)

// ============================================================
// Trends
// ============================================================

export const getTrending = (days = 60): Promise<TrendsResult> =>
  client.get<TrendsResult>('/trends/rising', { params: { days } }).then((r) => r.data)

export const getDeclining = (days = 60): Promise<TrendsResult> =>
  client.get<TrendsResult>('/trends/declining', { params: { days } }).then((r) => r.data)

export const getNewEntrants = (days = 30): Promise<TrendsResult> =>
  client.get<TrendsResult>('/trends/new-entrants', { params: { days } }).then((r) => r.data)

export const getMonthlyRanking = (
  sellerId: string,
  year: number,
  month: number
): Promise<MonthlyRanking> =>
  client
    .get<MonthlyRanking>(`/trends/monthly/${sellerId}`, { params: { year, month } })
    .then((r) => r.data)

// ============================================================
// Matrix
// ============================================================

export const getPriceVolumeMatrix = (params: MatrixFilters): Promise<MatrixResult> =>
  client.get<MatrixResult>('/matrix/price-volume', { params }).then((r) => r.data)

export const getPriceHeatmap = (): Promise<HeatmapResult> =>
  client.get<HeatmapResult>('/matrix/heatmap').then((r) => r.data)
