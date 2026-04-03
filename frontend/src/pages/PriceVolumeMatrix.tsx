import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, AlertCircle } from 'lucide-react'
import { getPriceVolumeMatrix, getSkuPriceHistory } from '../api/endpoints'
import { useAppContext } from '../context/AppContext'
import FilterBar from '../components/FilterBar'
import QuadrantChart from '../components/QuadrantChart'
import PriceLineChart from '../components/PriceLineChart'
import { SkeletonCard } from '../components/LoadingSpinner'
import { useFilters } from '../hooks/useFilters'
import type { MatrixPoint } from '../types'
import { format, parseISO } from 'date-fns'

function SKUDetailModal({
  point,
  onClose,
}: {
  point: MatrixPoint
  onClose: () => void
}) {
  const { data: history, isLoading } = useQuery({
    queryKey: ['price-history', point.sku_id, 30],
    queryFn: () => getSkuPriceHistory(point.sku_id, 30),
    staleTime: 300_000,
  })

  // Transform history into PriceLineChart format
  const chartData = (() => {
    if (!history?.history) return []
    const grouped: Record<string, number> = {}
    for (const h of history.history) {
      const day = h.recorded_at.slice(0, 10)
      if (!grouped[day]) grouped[day] = h.price
    }
    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, price]) => ({ date, [point.seller_name]: price }))
  })()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backdropFilter: 'blur(6px)', backgroundColor: 'rgba(10,15,30,0.7)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-2xl bg-surface-dark border border-border-dark rounded-2xl shadow-card animate-fade-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between p-5 border-b border-border-dark">
          <div className="flex-1 pr-4">
            <h3 className="font-bold text-text-primary text-base leading-snug">{point.title}</h3>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-text-secondary">
              <span className="px-2 py-0.5 rounded-full bg-petroleum-700/50 text-petroleum-300">
                {point.category}
              </span>
              <span>{point.seller_name}</span>
              <span>⭐ {point.rating.toFixed(1)}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-petroleum-500/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Key metrics */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-surface-darker border border-border-dark">
              <p className="text-xs text-text-secondary mb-1">Preço Atual</p>
              <p className="font-bold text-text-primary">
                {point.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-surface-darker border border-border-dark">
              <p className="text-xs text-text-secondary mb-1">Vol. Mensal Est.</p>
              <p className="font-bold text-text-primary">
                {point.volume.toLocaleString('pt-BR')}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-surface-darker border border-border-dark">
              <p className="text-xs text-text-secondary mb-1">Receita Est.</p>
              <p className="font-bold text-orange-accent">
                {point.revenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            </div>
          </div>

          {/* Price history chart */}
          <div>
            <h4 className="text-sm font-semibold text-text-primary mb-3">
              Histórico de Preço — 30 dias
            </h4>
            {isLoading ? (
              <div className="h-48 rounded-lg bg-petroleum-700/20 animate-pulse" />
            ) : chartData.length > 0 ? (
              <PriceLineChart
                data={chartData}
                sellers={[point.seller_name]}
                height={180}
                showLegend={false}
              />
            ) : (
              <p className="text-sm text-text-secondary text-center py-8">
                Sem histórico de preço disponível.
              </p>
            )}
          </div>

          {/* Quadrant classification */}
          <div>
            <h4 className="text-sm font-semibold text-text-primary mb-2">Classificação no Quadrante</h4>
            <div className="text-sm text-text-secondary">
              {point.volume > 0 && point.price > 0 && (
                <p>
                  Este produto está posicionado como{' '}
                  <span className="font-semibold text-text-primary">
                    {point.price > 1000 && point.volume > 100
                      ? 'Star Premium (alto preço + alto volume)'
                      : point.price <= 1000 && point.volume > 100
                      ? 'Volume Leader (baixo preço + alto volume)'
                      : point.price > 1000 && point.volume <= 100
                      ? 'Nicho / Estagnado (alto preço + baixo volume)'
                      : 'Commodity (baixo preço + baixo volume)'}
                  </span>
                  .
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PriceVolumeMatrix() {
  const { selectedSellerId } = useAppContext()
  const { filters, setPeriod, setCategory, setMinPrice, setMaxPrice, clearFilters } = useFilters()
  const [selectedPoint, setSelectedPoint] = useState<MatrixPoint | null>(null)
  const [highlightSeller, setHighlightSeller] = useState<string>('')

  const periodDays = parseInt(filters.period.replace('d', ''), 10)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['matrix', selectedSellerId, filters.category, periodDays],
    queryFn: () =>
      getPriceVolumeMatrix({
        seller_id: selectedSellerId || undefined,
        category: filters.category || undefined,
        days: periodDays,
      }),
    staleTime: 60_000,
  })

  const matrixData = (data?.data || []).filter((d) => {
    if (filters.minPrice && d.price < filters.minPrice) return false
    if (filters.maxPrice && d.price > filters.maxPrice) return false
    return true
  })

  const sellers = [...new Set(matrixData.map((d) => d.seller_name))]

  return (
    <div className="flex-1 p-6 space-y-6 animate-fade-in">
      {/* Filters */}
      <FilterBar
        period={filters.period}
        onPeriodChange={setPeriod}
        category={filters.category}
        onCategoryChange={setCategory}
        minPrice={filters.minPrice}
        maxPrice={filters.maxPrice}
        onMinPriceChange={setMinPrice}
        onMaxPriceChange={setMaxPrice}
        onClear={clearFilters}
      />

      {/* Seller highlight */}
      {sellers.length > 1 && (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-text-secondary">Destacar vendedor:</span>
          <select
            value={highlightSeller}
            onChange={(e) => setHighlightSeller(e.target.value)}
            className="bg-surface-dark border border-border-dark rounded-lg px-3 py-1.5 text-text-primary text-sm focus:outline-none focus:border-petroleum-400"
          >
            <option value="">Todos</option>
            {sellers.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      )}

      {/* Chart */}
      <div className="rounded-xl border border-border-dark bg-surface-dark p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-text-primary">
              Quadrante Preço × Volume
            </h2>
            <p className="text-sm text-text-secondary mt-0.5">
              {matrixData.length} produtos · Clique em um ponto para ver detalhes
            </p>
          </div>
          <div className="text-xs text-text-secondary">
            Últimos {periodDays} dias
          </div>
        </div>

        {isLoading ? (
          <div className="h-96 rounded-xl bg-petroleum-700/10 animate-pulse flex items-center justify-center">
            <p className="text-text-secondary text-sm">Carregando matriz...</p>
          </div>
        ) : isError ? (
          <div className="h-64 flex items-center justify-center text-danger">
            <AlertCircle className="w-6 h-6 mr-2" />
            <p className="text-sm">Erro ao carregar dados da matriz.</p>
          </div>
        ) : matrixData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-text-secondary">
            <p className="text-sm">Nenhum produto encontrado para os filtros aplicados.</p>
          </div>
        ) : (
          <QuadrantChart
            data={matrixData}
            onPointClick={setSelectedPoint}
            highlightSeller={highlightSeller || undefined}
          />
        )}
      </div>

      {/* Quadrant description cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            title: 'Stars Premium',
            desc: 'Alto preço + alto volume. Produtos líderes de mercado.',
            color: 'text-purple-400',
            bg: 'bg-purple-500/10',
            border: 'border-purple-500/20',
          },
          {
            title: 'Volume Leaders',
            desc: 'Baixo preço + alto volume. Estratégia de massa.',
            color: 'text-petroleum-400',
            bg: 'bg-petroleum-500/10',
            border: 'border-petroleum-500/20',
          },
          {
            title: 'Commodities',
            desc: 'Baixo preço + baixo volume. Alta concorrência, baixa margem.',
            color: 'text-text-secondary',
            bg: 'bg-border-dark/30',
            border: 'border-border-dark',
          },
          {
            title: 'Nicho / Estagnado',
            desc: 'Alto preço + baixo volume. Produtos de nicho ou sem demanda.',
            color: 'text-orange-accent',
            bg: 'bg-orange-accent/10',
            border: 'border-orange-accent/20',
          },
        ].map((q) => (
          <div key={q.title} className={`rounded-xl border p-4 ${q.bg} ${q.border}`}>
            <p className={`text-sm font-bold mb-1 ${q.color}`}>{q.title}</p>
            <p className="text-xs text-text-secondary leading-relaxed">{q.desc}</p>
          </div>
        ))}
      </div>

      {/* SKU Detail Modal */}
      {selectedPoint && (
        <SKUDetailModal point={selectedPoint} onClose={() => setSelectedPoint(null)} />
      )}
    </div>
  )
}
