import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  DollarSign,
  ShoppingCart,
  Package,
  AlertCircle,
  BarChart2,
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
  Treemap,
} from 'recharts'
import { getRevenue, compareRevenue, getSellers } from '../api/endpoints'
import { useAppContext } from '../context/AppContext'
import KPICard from '../components/KPICard'
import DataTable from '../components/DataTable'
import { SkeletonCard } from '../components/LoadingSpinner'
import type { SkuRevenue } from '../types'
import { useQuery as useRQ } from '@tanstack/react-query'

type Period = 'monthly' | 'quarterly' | 'semiannual' | 'annual'

const PERIOD_LABELS: Record<Period, string> = {
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  annual: 'Anual',
}

const CATEGORY_COLORS = [
  '#0F4C75', '#FF6B35', '#00D4AA', '#FFB800', '#A855F7',
  '#06B6D4', '#84CC16', '#F97316', '#EC4899', '#14B8A6',
]

function CustomTreemapContent({ x, y, width, height, name, value, index }: any) {
  if (width < 30 || height < 20) return null
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
        fillOpacity={0.8}
        stroke="#0A0F1E"
        strokeWidth={2}
        rx={4}
      />
      {width > 60 && height > 30 && (
        <>
          <text
            x={x + width / 2}
            y={y + height / 2 - 6}
            textAnchor="middle"
            fill="white"
            fontSize={11}
            fontWeight="600"
          >
            {name}
          </text>
          <text
            x={x + width / 2}
            y={y + height / 2 + 10}
            textAnchor="middle"
            fill="rgba(255,255,255,0.8)"
            fontSize={10}
          >
            {(value as number).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </text>
        </>
      )}
    </g>
  )
}

export default function RevenueEstimator() {
  const { selectedSellerId } = useAppContext()
  const [period, setPeriod] = useState<Period>('monthly')

  const { data: sellersData } = useRQ({
    queryKey: ['sellers'],
    queryFn: getSellers,
    staleTime: 300_000,
  })

  const {
    data: revenue,
    isLoading: revLoading,
    isError: revError,
  } = useQuery({
    queryKey: ['revenue', selectedSellerId, period],
    queryFn: () => getRevenue(selectedSellerId!, period),
    enabled: Boolean(selectedSellerId),
    staleTime: 300_000,
  })

  // Get all seller IDs for comparison
  const allSellerIds = (sellersData || []).map((s) => s.seller_id)
  const { data: comparison } = useQuery({
    queryKey: ['revenue-compare', allSellerIds.join(','), period],
    queryFn: () => compareRevenue(allSellerIds, period),
    enabled: allSellerIds.length > 1,
    staleTime: 300_000,
  })

  if (!selectedSellerId) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center text-text-secondary">
          <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>Selecione uma loja para ver estimativas de faturamento.</p>
        </div>
      </div>
    )
  }

  const topSkus = revenue?.top_revenue_skus || revenue?.by_sku || []
  const byCategory = revenue?.by_category || []

  const totalRevenue = revenue?.total_estimated_revenue || 0
  const avgTicket =
    topSkus.length > 0
      ? topSkus.reduce((sum, s) => sum + s.price, 0) / topSkus.length
      : 0
  const totalUnits = topSkus.reduce((sum, s) => sum + s.estimated_monthly_sales, 0)

  // Treemap data
  const treemapData = byCategory.slice(0, 10).map((c, i) => ({
    name: c.category,
    size: c.estimated_revenue ?? c.total_revenue ?? 0,
    value: c.estimated_revenue ?? c.total_revenue ?? 0,
    index: i,
  }))

  // Comparison bar chart
  const comparisonData = (() => {
    if (!comparison?.sellers) return []
    return comparison.sellers.map((s) => ({
      name: s.seller_name || s.seller_id,
      revenue: s.total_estimated_revenue ?? s.total_revenue ?? 0,
    }))
  })()

  const tableColumns = [
    {
      key: 'title',
      header: 'SKU / Produto',
      render: (row: SkuRevenue) => (
        <div>
          <p className="font-medium text-text-primary line-clamp-1 text-sm">{row.title}</p>
          <p className="text-xs text-text-secondary font-mono">{row.sku_id}</p>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Categoria',
      render: (row: SkuRevenue) => (
        <span className="text-xs px-2 py-0.5 rounded-full bg-petroleum-700/40 text-petroleum-300">
          {row.category}
        </span>
      ),
    },
    {
      key: 'price',
      header: 'Preço Médio',
      sortable: true,
      render: (row: SkuRevenue) =>
        (row.price ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    },
    {
      key: 'estimated_monthly_sales',
      header: 'Vol. Est.',
      sortable: true,
      render: (row: SkuRevenue) => (row.estimated_monthly_sales ?? 0).toLocaleString('pt-BR'),
    },
    {
      key: 'estimated_revenue',
      header: 'Faturamento Est.',
      sortable: true,
      render: (row: SkuRevenue) => (
        <span className="font-semibold text-text-primary">
          {(row.estimated_revenue ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
        </span>
      ),
    },
    {
      key: 'revenue_pct',
      header: '% do Total',
      sortable: true,
      align: 'right' as const,
      render: (row: SkuRevenue) => (
        <div className="flex items-center gap-2 justify-end">
          <div className="w-16 h-1.5 bg-border-dark rounded-full overflow-hidden">
            <div
              className="h-full bg-orange-accent rounded-full"
              style={{ width: `${Math.min(100, row.revenue_pct || 0)}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-text-primary w-10 text-right">
            {(row.revenue_pct || 0).toFixed(1)}%
          </span>
        </div>
      ),
    },
  ] as any[]

  return (
    <div className="flex-1 p-6 space-y-6 animate-fade-in">
      {/* Period tabs */}
      <div className="flex rounded-xl border border-border-dark overflow-hidden w-fit">
        {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={clsx(
              'px-5 py-2.5 text-sm font-medium transition-colors',
              period === p
                ? 'bg-petroleum-500 text-white'
                : 'text-text-secondary hover:text-text-primary hover:bg-petroleum-500/10'
            )}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPICard
          title="Faturamento Total Est."
          value={totalRevenue}
          icon={DollarSign}
          color="green"
          format="currency"
          loading={revLoading}
          subtitle={`Período: ${PERIOD_LABELS[period].toLowerCase()}`}
        />
        <KPICard
          title="Ticket Médio"
          value={avgTicket}
          icon={ShoppingCart}
          color="blue"
          format="currency"
          loading={revLoading}
        />
        <KPICard
          title="Volume Total de Unidades"
          value={totalUnits}
          icon={Package}
          color="orange"
          format="number"
          loading={revLoading}
        />
      </div>

      {/* Revenue by category - Treemap */}
      <div className="rounded-xl border border-border-dark bg-surface-dark p-5">
        <h3 className="text-base font-semibold text-text-primary mb-4 flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-petroleum-400" />
          Distribuição de Faturamento por Categoria
        </h3>
        {revLoading ? (
          <div className="h-48 rounded-xl bg-petroleum-700/10 animate-pulse" />
        ) : treemapData.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <Treemap
              data={treemapData}
              dataKey="size"
              aspectRatio={4 / 3}
              content={<CustomTreemapContent />}
            />
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-text-secondary text-center py-8">Sem dados de categoria.</p>
        )}
      </div>

      {/* Detailed SKU table */}
      <div className="rounded-xl border border-border-dark bg-surface-dark">
        <div className="p-5 border-b border-border-dark">
          <h3 className="text-base font-semibold text-text-primary">
            Detalhamento por SKU
          </h3>
          <p className="text-sm text-text-secondary mt-0.5">
            Top {topSkus.length} SKUs por faturamento estimado
          </p>
        </div>
        <div className="p-5">
          {revError ? (
            <div className="flex items-center justify-center py-8 text-danger gap-2">
              <AlertCircle className="w-5 h-5" />
              <p className="text-sm">Erro ao carregar dados de faturamento.</p>
            </div>
          ) : (
            <>
              <DataTable
                columns={tableColumns}
                data={topSkus as any[]}
                loading={revLoading}
                emptyMessage="Nenhum SKU encontrado."
                getRowKey={(_, i) => i}
              />
              {/* Total row */}
              {topSkus.length > 0 && !revLoading && (
                <div className="mt-3 p-3 rounded-lg bg-petroleum-500/10 border border-petroleum-500/20 flex items-center justify-between text-sm">
                  <span className="font-bold text-text-primary uppercase tracking-wide text-xs">
                    TOTAL ({topSkus.length} SKUs)
                  </span>
                  <span className="font-black text-success text-base">
                    {totalRevenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Competitor comparison */}
      {comparisonData.length > 1 && (
        <div className="rounded-xl border border-border-dark bg-surface-dark p-5">
          <h3 className="text-base font-semibold text-text-primary mb-4">
            Comparativo de Faturamento — Loja Alvo vs Concorrentes
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={comparisonData}
              margin={{ top: 10, right: 20, bottom: 20, left: 60 }}
            >
              <XAxis
                dataKey="name"
                tick={{ fill: '#8AA8C0', fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: '#1E3A5F' }}
              />
              <YAxis
                tickFormatter={(v) =>
                  v >= 1_000_000
                    ? `R$ ${(v / 1_000_000).toFixed(1)}M`
                    : v >= 1_000
                    ? `R$ ${(v / 1_000).toFixed(0)}K`
                    : `R$ ${v}`
                }
                tick={{ fill: '#8AA8C0', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0D1B2A',
                  border: '1px solid #1E3A5F',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number) => [
                  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                  'Faturamento Est.',
                ]}
              />
              <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                {comparisonData.map((_, i) => (
                  <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Summary table */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-dark">
                  <th className="text-left py-2 px-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Vendedor</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">Faturamento Est.</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-text-secondary uppercase tracking-wide">vs Loja Alvo</th>
                </tr>
              </thead>
              <tbody>
                {comparisonData.map((row, i) => {
                  const targetRevenue = comparisonData[0]?.revenue || 1
                  const pct = (row.revenue / targetRevenue) * 100
                  return (
                    <tr key={row.name} className="border-b border-border-dark/50">
                      <td className="py-2 px-3 font-medium text-text-primary flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }}
                        />
                        {row.name}
                        {i === 0 && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-success/20 text-success">
                            Alvo
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right font-semibold text-text-primary">
                        {(row.revenue ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <span
                          className={clsx(
                            'text-sm font-semibold',
                            pct > 100 ? 'text-danger' : pct === 100 ? 'text-text-primary' : 'text-success'
                          )}
                        >
                          {pct.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
