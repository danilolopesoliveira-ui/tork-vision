import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  GitCompareArrows,
  AlertCircle,
  PlusCircle,
  ArrowLeftRight,
  TrendingUp,
  Package,
  DollarSign,
  Layers,
} from 'lucide-react'
import clsx from 'clsx'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Cell,
} from 'recharts'
import { getStoreComparison } from '../api/endpoints'
import { useAppContext } from '../context/AppContext'
import { SkeletonCard } from '../components/LoadingSpinner'
import URLInputModal from '../components/URLInputModal'
import type { StoreComparisonResult } from '../types'

const COLOR_A = '#0F4C75'
const COLOR_B = '#FF6B35'

function KPICompareCard({
  label,
  valueA,
  valueB,
  nameA,
  nameB,
  format = 'number',
  icon: Icon,
}: {
  label: string
  valueA: number
  valueB: number
  nameA: string
  nameB: string
  format?: 'number' | 'currency'
  icon: React.ComponentType<{ className?: string }>
}) {
  const fmt = (v: number) =>
    format === 'currency'
      ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : v.toLocaleString('pt-BR')

  const diff = valueA > 0 ? ((valueB - valueA) / valueA) * 100 : 0
  const winner = valueA >= valueB ? 'a' : 'b'

  return (
    <div className="rounded-xl border border-border-dark bg-surface-dark p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-text-secondary" />
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">{label}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className={clsx('rounded-lg p-3 border', winner === 'a' ? 'border-petroleum-400/40 bg-petroleum-500/10' : 'border-border-dark/50')}>
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLOR_A }} />
            <span className="text-xs text-text-secondary truncate">{nameA}</span>
            {winner === 'a' && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-success/20 text-success ml-auto">Maior</span>}
          </div>
          <p className="text-base font-bold text-text-primary">{fmt(valueA)}</p>
        </div>
        <div className={clsx('rounded-lg p-3 border', winner === 'b' ? 'border-orange-accent/40 bg-orange-accent/5' : 'border-border-dark/50')}>
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLOR_B }} />
            <span className="text-xs text-text-secondary truncate">{nameB}</span>
            {winner === 'b' && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-success/20 text-success ml-auto">Maior</span>}
          </div>
          <p className="text-base font-bold text-text-primary">{fmt(valueB)}</p>
        </div>
      </div>
      {valueA > 0 && (
        <p className="text-xs text-text-secondary mt-2 text-center">
          Diferença:{' '}
          <span className={clsx('font-semibold', diff > 0 ? 'text-orange-accent' : 'text-success')}>
            {diff > 0 ? '+' : ''}{diff.toFixed(1)}% ({nameB} vs {nameA})
          </span>
        </p>
      )}
    </div>
  )
}

function OverlapGauge({ data }: { data: StoreComparisonResult['overlap']; nameA: string; nameB: string }) {
  const pctA = data.overlap_pct_a
  const pctB = data.overlap_pct_b

  return (
    <div className="rounded-xl border border-border-dark bg-surface-dark p-5">
      <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
        <ArrowLeftRight className="w-4 h-4 text-petroleum-400" />
        Sobreposição de SKUs
      </h3>
      <div className="grid grid-cols-3 gap-4 text-center mb-5">
        <div>
          <p className="text-2xl font-black text-petroleum-400">{data.unique_to_a}</p>
          <p className="text-xs text-text-secondary mt-0.5">Exclusivos A</p>
        </div>
        <div>
          <p className="text-2xl font-black text-orange-accent">{data.shared_sku_count}</p>
          <p className="text-xs text-text-secondary mt-0.5">Em comum</p>
        </div>
        <div>
          <p className="text-2xl font-black" style={{ color: COLOR_B }}>{data.unique_to_b}</p>
          <p className="text-xs text-text-secondary mt-0.5">Exclusivos B</p>
        </div>
      </div>
      <div className="space-y-2">
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-text-secondary">% do portfólio de A em comum com B</span>
            <span className="font-semibold text-petroleum-400">{pctA}%</span>
          </div>
          <div className="h-2 bg-border-dark rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${pctA}%`, backgroundColor: COLOR_A }} />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-text-secondary">% do portfólio de B em comum com A</span>
            <span className="font-semibold text-orange-accent">{pctB}%</span>
          </div>
          <div className="h-2 bg-border-dark rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${pctB}%`, backgroundColor: COLOR_B }} />
          </div>
        </div>
      </div>
      {data.shared_categories.length > 0 && (
        <div className="mt-4">
          <p className="text-xs text-text-secondary mb-2">Categorias em comum:</p>
          <div className="flex flex-wrap gap-1.5">
            {data.shared_categories.map((cat) => (
              <span key={cat} className="text-xs px-2 py-0.5 rounded-full bg-petroleum-700/40 text-petroleum-300">
                {cat}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function StoreComparison() {
  const { selectedSellerId, comparedSellerId, setComparedSellerId, sellers, setShowURLModal } = useAppContext()
  const [showAnalyzeModal, setShowAnalyzeModal] = useState(false)

  const canCompare = Boolean(selectedSellerId && comparedSellerId && selectedSellerId !== comparedSellerId)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['compare', selectedSellerId, comparedSellerId],
    queryFn: () => getStoreComparison(selectedSellerId!, comparedSellerId!),
    enabled: canCompare,
    staleTime: 300_000,
  })

  const otherSellers = sellers.filter((s) => s.seller_id !== selectedSellerId)

  return (
    <div className="flex-1 p-6 space-y-6 animate-fade-in">
      {/* Store selector bar */}
      <div className="rounded-xl border border-border-dark bg-surface-dark p-5">
        <div className="flex items-center gap-3 mb-1">
          <GitCompareArrows className="w-5 h-5 text-orange-accent" />
          <h2 className="text-base font-semibold text-text-primary">Comparar Lojas</h2>
        </div>
        <p className="text-sm text-text-secondary mb-4">
          Selecione duas lojas para ver um diagnóstico comparativo completo lado a lado.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-center">
          {/* Store A — currently selected (read-only indicator) */}
          <div className="rounded-lg border border-petroleum-400/30 bg-petroleum-500/10 px-4 py-3">
            <p className="text-[10px] font-semibold text-petroleum-400 uppercase tracking-wide mb-0.5">Loja A (selecionada)</p>
            <p className="font-semibold text-text-primary">
              {sellers.find((s) => s.seller_id === selectedSellerId)?.seller_name ?? selectedSellerId ?? '—'}
            </p>
            <p className="text-xs text-text-secondary">
              {sellers.find((s) => s.seller_id === selectedSellerId)?.total_skus ?? '?'} SKUs
            </p>
          </div>

          <div className="flex items-center justify-center">
            <ArrowLeftRight className="w-5 h-5 text-text-secondary/40" />
          </div>

          {/* Store B selector */}
          <div className="rounded-lg border border-border-dark bg-surface-darker px-4 py-3">
            <p className="text-[10px] font-semibold text-orange-accent uppercase tracking-wide mb-1.5">Loja B (comparação)</p>
            {otherSellers.length > 0 ? (
              <select
                value={comparedSellerId ?? ''}
                onChange={(e) => setComparedSellerId(e.target.value || null)}
                className="w-full bg-transparent text-text-primary text-sm font-semibold focus:outline-none"
              >
                <option value="">Selecionar loja...</option>
                {otherSellers.map((s) => (
                  <option key={s.seller_id} value={s.seller_id}>
                    {s.seller_name} ({s.total_skus} SKUs)
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-text-secondary">Nenhuma outra loja analisada.</p>
            )}
          </div>
        </div>

        {/* Analyze new store CTA */}
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => { setShowURLModal(true) }}
            className="flex items-center gap-1.5 text-xs text-petroleum-400 hover:text-petroleum-300 transition-colors"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            Analisar nova loja para comparar
          </button>
        </div>
      </div>

      {/* Empty state */}
      {!canCompare && (
        <div className="flex-1 flex items-center justify-center py-16">
          <div className="text-center text-text-secondary">
            <GitCompareArrows className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Selecione uma segunda loja acima para iniciar a comparação.</p>
            <p className="text-sm mt-1 opacity-60">Você pode analisar qualquer loja do Mercado Livre.</p>
          </div>
        </div>
      )}

      {/* Loading */}
      {canCompare && isLoading && (
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} lines={3} />)}
        </div>
      )}

      {/* Error */}
      {canCompare && isError && (
        <div className="flex items-center justify-center py-16 text-danger gap-2">
          <AlertCircle className="w-6 h-6" />
          <p>Erro ao carregar comparação. Verifique se ambas as lojas foram analisadas.</p>
        </div>
      )}

      {/* Results */}
      {data && !isLoading && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICompareCard
              label="Total de SKUs"
              valueA={data.seller_a.total_skus}
              valueB={data.seller_b.total_skus}
              nameA={data.seller_a.seller_name}
              nameB={data.seller_b.seller_name}
              icon={Package}
            />
            <KPICompareCard
              label="Faturamento Est./mês"
              valueA={data.seller_a.total_estimated_revenue}
              valueB={data.seller_b.total_estimated_revenue}
              nameA={data.seller_a.seller_name}
              nameB={data.seller_b.seller_name}
              format="currency"
              icon={DollarSign}
            />
            <KPICompareCard
              label="Preço Médio"
              valueA={data.seller_a.avg_price}
              valueB={data.seller_b.avg_price}
              nameA={data.seller_a.seller_name}
              nameB={data.seller_b.seller_name}
              format="currency"
              icon={TrendingUp}
            />
            <KPICompareCard
              label="Categorias"
              valueA={data.seller_a.categories.length}
              valueB={data.seller_b.categories.length}
              nameA={data.seller_a.seller_name}
              nameB={data.seller_b.seller_name}
              icon={Layers}
            />
          </div>

          {/* Overlap + Category chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <OverlapGauge
              data={data.overlap}
              nameA={data.seller_a.seller_name}
              nameB={data.seller_b.seller_name}
            />

            {/* Category revenue comparison */}
            <div className="rounded-xl border border-border-dark bg-surface-dark p-5">
              <h3 className="text-sm font-semibold text-text-primary mb-4">Faturamento por Categoria</h3>
              {data.category_comparison.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={data.category_comparison.slice(0, 8)}
                    layout="vertical"
                    margin={{ top: 0, right: 20, bottom: 0, left: 10 }}
                  >
                    <XAxis
                      type="number"
                      tickFormatter={(v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}K` : String(v)}
                      tick={{ fill: '#8AA8C0', fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="category"
                      width={110}
                      tick={{ fill: '#8AA8C0', fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0D1B2A', border: '1px solid #1E3A5F', borderRadius: 8, fontSize: 11 }}
                      formatter={(v: number, name: string) => [
                        v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                        name === 'a_revenue' ? data.seller_a.seller_name : data.seller_b.seller_name,
                      ]}
                    />
                    <Legend
                      formatter={(v) => v === 'a_revenue' ? data.seller_a.seller_name : data.seller_b.seller_name}
                      wrapperStyle={{ fontSize: 11 }}
                    />
                    <Bar dataKey="a_revenue" fill={COLOR_A} radius={[0, 3, 3, 0]} />
                    <Bar dataKey="b_revenue" fill={COLOR_B} radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-text-secondary text-center py-8">Sem dados de categoria.</p>
              )}
            </div>
          </div>

          {/* Top SKUs side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {([
              { seller: data.seller_a, color: COLOR_A },
              { seller: data.seller_b, color: COLOR_B },
            ] as const).map(({ seller, color }) => (
              <div key={seller.seller_id} className="rounded-xl border border-border-dark bg-surface-dark">
                <div className="p-4 border-b border-border-dark flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                  <h3 className="text-sm font-semibold text-text-primary">
                    Top Produtos — {seller.seller_name}
                  </h3>
                </div>
                <div className="divide-y divide-border-dark/50">
                  {seller.top_skus.map((sku, i) => (
                    <div key={sku.sku_id} className="flex items-start gap-3 px-4 py-3 hover:bg-petroleum-500/5 transition-colors">
                      <span className="text-xs font-bold text-text-secondary/50 w-4 flex-shrink-0 mt-0.5">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text-primary font-medium truncate">{sku.title}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-text-secondary/60">{sku.category}</span>
                          <span className="text-xs font-semibold text-text-primary">
                            {sku.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-bold text-orange-accent">
                          {sku.estimated_monthly_revenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </p>
                        <p className="text-[10px] text-text-secondary">{sku.estimated_monthly_sales} un/mês</p>
                      </div>
                    </div>
                  ))}
                  {seller.top_skus.length === 0 && (
                    <p className="text-sm text-text-secondary text-center py-8">Sem produtos.</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Category detail table */}
          {data.category_comparison.length > 0 && (
            <div className="rounded-xl border border-border-dark bg-surface-dark">
              <div className="p-4 border-b border-border-dark">
                <h3 className="text-sm font-semibold text-text-primary">Detalhamento por Categoria</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border-dark">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">Categoria</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide" style={{ color: COLOR_A }}>
                        {data.seller_a.seller_name} — SKUs
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide" style={{ color: COLOR_B }}>
                        {data.seller_b.seller_name} — SKUs
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: COLOR_A }}>Fat. A</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: COLOR_B }}>Fat. B</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-text-secondary uppercase tracking-wide">Preço Méd. A</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-text-secondary uppercase tracking-wide">Preço Méd. B</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.category_comparison.map((row, i) => (
                      <tr key={row.category} className={clsx('border-b border-border-dark/50 hover:bg-petroleum-500/5', i % 2 === 1 && 'bg-surface-dark/50')}>
                        <td className="px-4 py-2.5">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-petroleum-700/40 text-petroleum-300">
                            {row.category}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center font-semibold text-text-primary">{row.a_skus}</td>
                        <td className="px-4 py-2.5 text-center font-semibold text-text-primary">{row.b_skus}</td>
                        <td className="px-4 py-2.5 text-right text-xs font-semibold" style={{ color: COLOR_A }}>
                          {row.a_revenue > 0 ? row.a_revenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right text-xs font-semibold" style={{ color: COLOR_B }}>
                          {row.b_revenue > 0 ? row.b_revenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right text-xs text-text-secondary">
                          {row.a_avg_price > 0 ? row.a_avg_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right text-xs text-text-secondary">
                          {row.b_avg_price > 0 ? row.b_avg_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {showAnalyzeModal && <URLInputModal onClose={() => setShowAnalyzeModal(false)} />}
    </div>
  )
}
