import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Period } from '../types'

export interface FiltersState {
  period: Period
  category: string | null
  minPrice: number | null
  maxPrice: number | null
  marketplace: string | null
  page: number
}

export function useFilters() {
  const [searchParams, setSearchParams] = useSearchParams()

  const filters: FiltersState = useMemo(() => {
    const period = (searchParams.get('period') as Period) || '30d'
    const category = searchParams.get('category') || null
    const minPriceStr = searchParams.get('minPrice')
    const maxPriceStr = searchParams.get('maxPrice')
    const marketplace = searchParams.get('marketplace') || null
    const pageStr = searchParams.get('page')

    return {
      period,
      category,
      minPrice: minPriceStr ? parseFloat(minPriceStr) : null,
      maxPrice: maxPriceStr ? parseFloat(maxPriceStr) : null,
      marketplace,
      page: pageStr ? parseInt(pageStr, 10) : 1,
    }
  }, [searchParams])

  const setPeriod = useCallback(
    (period: Period) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set('period', period)
        return next
      })
    },
    [setSearchParams]
  )

  const setCategory = useCallback(
    (category: string | null) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        if (category) next.set('category', category)
        else next.delete('category')
        return next
      })
    },
    [setSearchParams]
  )

  const setMinPrice = useCallback(
    (minPrice: number | null) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        if (minPrice !== null) next.set('minPrice', String(minPrice))
        else next.delete('minPrice')
        return next
      })
    },
    [setSearchParams]
  )

  const setMaxPrice = useCallback(
    (maxPrice: number | null) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        if (maxPrice !== null) next.set('maxPrice', String(maxPrice))
        else next.delete('maxPrice')
        return next
      })
    },
    [setSearchParams]
  )

  const setMarketplace = useCallback(
    (marketplace: string | null) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        if (marketplace) next.set('marketplace', marketplace)
        else next.delete('marketplace')
        return next
      })
    },
    [setSearchParams]
  )

  const setPage = useCallback(
    (page: number) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set('page', String(page))
        return next
      })
    },
    [setSearchParams]
  )

  const clearFilters = useCallback(() => {
    setSearchParams({})
  }, [setSearchParams])

  return {
    filters,
    setPeriod,
    setCategory,
    setMinPrice,
    setMaxPrice,
    setMarketplace,
    setPage,
    clearFilters,
  }
}
