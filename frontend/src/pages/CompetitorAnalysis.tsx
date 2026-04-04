import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  AlertCircle,
  TrendingUp,
  DollarSign,
} from 'lucide-react'
import clsx from 'clsx'
import { getCompetitors, getPortfolioGap } from '../api/endpoints'
import { useAppContext } from '../context/AppContext'
import FilterBar from '../components/FilterBar'
import { SkeletonCard } from '../components/LoadingSpinner'
import type { CompetitorEntry } from '../types'
import { useFilters } from '../hooks/useFilters'

function RelationshipBadge({ type }: { type: string }) {
  const isDirect = type === 'direct' || type === 'direct_competitor'
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold',
        isDirect
          ? 'bg-danger/20 text-danger'
          : 'bg-warning/20 text-warning'
      )}
    >
      {isDirect ? 'Direto' : 'Indireto'}
    </span>
  )
}

function OverlapBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-border-dark rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-petroleum-400 transition-all"
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <span className="text-xs font-semibold text-text-primary w-10 text-right">
        {pct.toFixed(1)}%
      </span>
    </div>
  )
}

function CompetitorRow({
  comp,
  isDirect,
}: {
  comp: CompetitorEntry
  isDirect: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      <tr
        className={clsx(
          'border-b border-border-dark/50 hover:bg-petroleum-500/5 cursor-pointer transition-colors',
          expanded && 'bg-petroleum-500/5'
        )}
        onClick={() => setExpanded((e) => !e)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {expanded ? (
              <ChevronDown className="w-4 h-4 text-text-secondary" />
            ) : (
              <ChevronRight className="w-4 h-4 text-text-secondary" />
            )}
            <div className="w-7 h-7 rounded-lg bg-petroleum-700 flex items-center justify-center text-xs font-bold text-petroleum-300">
              {comp.seller_name.charAt(0)}
            </div>
            <span className="font-medium text-text-primary">{comp.seller_name}</span>
          </div>
        </td>
        <td className="px-4 py-3 text-center">
          <RelationshipBadge type={isDirect ? 'direct' : 'indirect'} />
        </td>
        <td className="px-4 py-3">
          <OverlapBar pct={comp.overlap_pct} />
        </td>
        <td className="px-4 py-3 text-center text-text-primary font-semibold text-sm">
          {comp.overlap_count}
        </td>
      </tr>
      {expanded && comp.shared_skus.length > 0 && (
        <tr className="border-b border-border-dark/50">
          <td colSpan={4} className="px-4 py-3 bg-surface-darker">
            <div className="pl-9">
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">
                SKUs em comum (amostra)
              </p>
              <div className="flex flex-wrap gap-2">
                {comp.shared_skus.slice(0, 10).map((skuId) => (
                  <span
                    key={skuId}
                    className="text-xs px-2 py-1 rounded bg-petroleum-700/40 text-petroleum-300 font-mono"
                  >
                    {skuId}
                  </span>
                ))}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function CompetitorAnalysis() {
  const { selectedSellerId } = useAppContext()
  const { filters, setCategory, setMinPrice, setMaxPrice, clearFilters } = useFilters()

  const {
    data: competitorData,
    isLoading: compLoading,
    isError: compError,
  } = useQuery({
    queryKey: ['competitors', selectedSellerId],
    queryFn: () => getCompetitors(selectedSellerId!),
    enabled: Boolean(selectedSellerId),
    staleTime: 300_000,
  })

  const {
    data: gapData,
    isLoading: gapLoading,
  } = useQuery({
    queryKey: ['portfolio-gap', selectedSellerId],
    queryFn: () => getPortfolioGap(selectedSellerId!),
    enabled: Boolean(selectedSellerId),
    staleTime: 300_000,
  })

  if (!selectedSellerId) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center text-text-secondary">
          <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>Selecione uma loja para ver os concorrentes.</p>
        </div>
      </div>
    )
  }

  const allCompetitors = [
    ...(competitorData?.direct_competitors || []).map((c) => ({ ...c, isDirect: true })),
    ...(competitorData?.indirect_competitors || []).map((c) => ({ ...c, isDirect: false })),
  ]

  const filteredGaps = (gapData?.gaps || []).filter((g) => {
    if (filters.category && g.category !== filters.category) return false
    if (filters.minPrice && g.price < filters.minPrice) return false
    if (filters.maxPrice && g.price > filters.maxPrice) return false
    return true
  })

  const totalGapRevenue = filteredGaps.reduce(
    (sum, g) => sum + g.price * g.estimated_monthly_sales,
    0
  )

  return (
    <div className="flex-1 p-6 space-y-6 animate-fade-in">
      {/* Competitors Table */}
      <div className="rounded-xl border border-border-dark bg-surface-dark">
        <div className="p-5 border-b border-border-dark">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-text-primary">
                Concorrentes Identificados
              </h2>
              <p className="text-sm text-text-secondary mt-0.5">
                {competitorData
                  ? `${competitorData.direct_competitors.length} diretos · ${competitorData.indirect_competitors.length} indiretos · ${competitorData.total_target_skus} SKUs analisados`
                  : 'Carregando...'}
              </p>
            </div>
            <div className="flex gap-2 text-xs">
              <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-danger/10 text-danger border border-danger/20">
                <span className="w-1.5 h-1.5 rounded-full bg-danger" />
                Direto
              </span>
              <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-warning/10 text-warning border border-warning/20">
                <span className="w-1.5 h-1.5 rounded-full bg-warning" />
                Indireto
              </span>
            </div>
          </div>
        </div>

        {compLoading ? (
          <div className="p-5 space-y-3">
            {[1, 2, 3].map((i) => <SkeletonCard key={i} lines={2} />)}
          </div>
        ) : compError ? (
          <div className="p-8 text-center text-danger">
            <AlertCircle className="w-8 h-8 mx-auto mb-2" />
            <p className="text-sm">Erro ao carregar concorrentes.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-dark">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">
                    Vendedor
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-text-secondary uppercase tracking-wide">
                    Tipo
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">
                    % Sobreposição
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-text-secondary uppercase tracking-wide">
                    SKUs em Comum
                  </th>
                </tr>
              </thead>
              <tbody>
                {allCompetitors.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-12 text-text-secondary text-sm">
                      Nenhum concorrente encontrado.
                    </td>
                  </tr>
                ) : (
                  allCompetitors.map((comp) => (
                    <CompetitorRow
                      key={comp.seller_id}
                      comp={comp}
                      isDirect={comp.isDirect}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Portfolio Gap */}
      <div className="rounded-xl border border-border-dark bg-surface-dark">
        <div className="p-5 border-b border-border-dark">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-orange-accent" />
                Oportunidades de Portfólio
              </h2>
              <p className="text-sm text-text-secondary mt-0.5">
                Produtos que concorrentes vendem e você ainda não tem
              </p>
            </div>
            {totalGapRevenue > 0 && (
              <div className="text-right">
                <p className="text-xs text-text-secondary">Receita potencial</p>
                <p className="text-lg font-bold text-orange-accent">
                  {totalGapRevenue.toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL',
                  })}
                  <span className="text-xs font-normal text-text-secondary">/mês</span>
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-b border-border-dark/50">
          <FilterBar
            category={filters.category}
            onCategoryChange={setCategory}
            minPrice={filters.minPrice}
            maxPrice={filters.maxPrice}
            onMinPriceChange={setMinPrice}
            onMaxPriceChange={setMaxPrice}
            onClear={clearFilters}
            showPeriod={false}
          />
        </div>

        {gapLoading ? (
          <div className="p-5 space-y-3">
            {[1, 2, 3].map((i) => <SkeletonCard key={i} lines={2} />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-dark">
                  {['Produto', 'Categoria', 'Concorrente', 'Vol. Mensal Est.', 'Preço', 'Receita Perdida Est.'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredGaps.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-text-secondary text-sm">
                      {gapData?.gaps.length === 0
                        ? 'Nenhuma oportunidade de portfólio encontrada.'
                        : 'Nenhum resultado para os filtros aplicados.'}
                    </td>
                  </tr>
                ) : (
                  filteredGaps.map((gap, i) => {
                    const lostRevenue = gap.price * gap.estimated_monthly_sales
                    return (
                      <tr
                        key={i}
                        className={clsx(
                          'border-b border-border-dark/50 hover:bg-petroleum-500/5 transition-colors',
                          i % 2 === 1 && 'bg-surface-dark/50'
                        )}
                      >
                        <td className="px-4 py-3 max-w-[200px]">
                          <p className="truncate font-medium text-text-primary">{gap.title}</p>
                          <p className="text-xs text-text-secondary font-mono">{gap.sku_id}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-petroleum-700/50 text-petroleum-300">
                            {gap.category}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-text-secondary text-sm">
                          {gap.competitor_seller_name}
                        </td>
                        <td className="px-4 py-3 text-center font-semibold text-text-primary">
                          {(gap.estimated_monthly_sales ?? 0).toLocaleString('pt-BR')}
                        </td>
                        <td className="px-4 py-3 font-semibold text-text-primary">
                          {(gap.price ?? 0).toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-bold text-orange-accent">
                            {lostRevenue.toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            })}
                          </span>
                          <span className="text-xs text-text-secondary">/mês</span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {totalGapRevenue > 0 && (
          <div className="p-4 border-t border-border-dark/50 bg-orange-accent/5">
            <div className="flex items-center gap-2 text-sm">
              <DollarSign className="w-4 h-4 text-orange-accent" />
              <span className="text-text-secondary">
                Total de receita potencial não capturada:
              </span>
              <span className="font-bold text-orange-accent text-base">
                {totalGapRevenue.toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                })}
                /mês
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
