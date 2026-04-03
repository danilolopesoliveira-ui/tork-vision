import { useQuery } from '@tanstack/react-query'
import { getDashboard, getSkus, getRevenue, getCompetitors, getSeller } from '../api/endpoints'

export function useSellerData(sellerId: string | null) {
  const enabled = Boolean(sellerId)

  const sellerQuery = useQuery({
    queryKey: ['seller', sellerId],
    queryFn: () => getSeller(sellerId!),
    enabled,
    staleTime: 60_000,
  })

  const dashboardQuery = useQuery({
    queryKey: ['dashboard', sellerId],
    queryFn: () => getDashboard(sellerId!),
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })

  const skusQuery = useQuery({
    queryKey: ['skus', sellerId],
    queryFn: () => getSkus({ seller_id: sellerId!, limit: 100 }),
    enabled,
    staleTime: 60_000,
  })

  const revenueQuery = useQuery({
    queryKey: ['revenue', sellerId, 'monthly'],
    queryFn: () => getRevenue(sellerId!, 'monthly'),
    enabled,
    staleTime: 300_000,
  })

  const competitorsQuery = useQuery({
    queryKey: ['competitors', sellerId],
    queryFn: () => getCompetitors(sellerId!),
    enabled,
    staleTime: 300_000,
  })

  const isLoading =
    sellerQuery.isLoading ||
    dashboardQuery.isLoading ||
    skusQuery.isLoading ||
    revenueQuery.isLoading

  const isError =
    sellerQuery.isError ||
    dashboardQuery.isError ||
    skusQuery.isError ||
    revenueQuery.isError

  return {
    seller: sellerQuery.data,
    dashboard: dashboardQuery.data,
    skus: skusQuery.data,
    revenue: revenueQuery.data,
    competitors: competitorsQuery.data,
    isLoading,
    isError,
    refetch: () => {
      dashboardQuery.refetch()
      skusQuery.refetch()
      revenueQuery.refetch()
    },
  }
}
