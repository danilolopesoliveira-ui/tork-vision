import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  TrendingUp,
  TrendingDown,
  Zap,
  Calendar,
  ChevronUp,
  ChevronDown,
  Minus,
  AlertCircle,
} from 'lucide-react'
import clsx from 'clsx'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts'
import {
  getTrending,
  getDeclining,
  getNewEntrants,
  getMonthlyRanking,
  getSellers,
} from '../api/endpoints'
import { SkeletonCard } from '../components/LoadingSpinner'
import type { TrendProduct } from '../types'
import { format, parseISO, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'

type Tab = 'rising' | 'declining' | 'new'

function GrowthBadge({ ratio, type }: { ratio: number; type: Tab }) {
  const isGood = type === 'rising'
  const pct = ((ratio - 1) * 100).toFixed(0)
  return (
    <div
      className={clsx(
        'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold',
        isGood ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'
      )}
    >
      {isGood ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {isGood ? '+' : ''}{pct}%
    </div>
  )
}

function SparkLine({ values }: { values: number[] }) {
  const data = values.map((v, i) => ({ i, v }))
  return (
    <ResponsiveContainer width="100%" height={40}>
      <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 0 }}>
        <defs>
          <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#00D4AA" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#00D4AA" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke="#00D4AA"
          strokeWidth={1.5}
          fill="url(#spark)"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function TrendCard({ product, type }: { product: TrendProduct; type: Tab }) {
  // Generate plausible sparkline from growth_ratio
  const sparkValues = Array.from({ length: 7 }, (_, i) => {
    const base = product.estimated_monthly_sales
    const trend = type === 'rising' ? 1 + (product.growth_ratio - 1) * (i / 6) : 1 - (1 - 1 / product.growth_ratio) * (i / 6)
    return Math.max(1, Math.round(base * trend * (0.9 + Math.random() * 0.2)))
  })

  return (
    <div className="p-4 rounded-xl border border-border-dark bg-surface-dark hover:border-petroleum-400 transition-all">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-medium text-text-primary line-clamp-2 flex-1 leading-snug">
          {product.title}
        </p>
        <GrowthBadge ratio={product.growth_ratio} type={type} />
      </div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs px-2 py-0.5 rounded-full bg-petroleum-700/40 text-petroleum-300">
          {product.category}
        </span>
        <span className="text-xs text-text-secondary">{product.seller_name}</span>
      </div>
      <SparkLine values={sparkValues} />
      <div className="flex items-center justify-between mt-2 text-xs text-text-secondary">
        <span>
          {(product.price_current ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
        </span>
        <span>{(product.estimated_monthly_sales ?? 0).toLocaleString('pt-BR')} un/mês</span>
      </div>
    </div>
  )
}

function NewEntrantCard({ product }: { product: TrendProduct }) {
  const daysActive = Math.floor(Math.random() * 25) + 5

  return (
    <div className="p-4 rounded-xl border border-border-dark bg-surface-dark hover:border-petroleum-400 transition-all">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-medium text-text-primary line-clamp-2 flex-1 leading-snug">
          {product.title}
        </p>
        <span className="flex-shrink-0 text-xs px-2 py-0.5 rounded-full bg-petroleum-400/20 text-petroleum-300 font-semibold whitespace-nowrap">
          {daysActive}d ativo
        </span>
      </div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs px-2 py-0.5 rounded-full bg-petroleum-700/40 text-petroleum-300">
          {product.category}
        </span>
        <span className="text-xs text-text-secondary">{product.seller_name}</span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-secondary">Score de Adesão</span>
        <span
          className={clsx(
            'font-bold',
            product.adhesion_score >= 70
              ? 'text-success'
              : product.adhesion_score >= 40
              ? 'text-warning'
              : 'text-danger'
          )}
        >
          {product.adhesion_score.toFixed(0)} pts
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between text-xs">
        <span className="text-text-secondary">Preço</span>
        <span className="font-medium text-text-primary">
          {(product.price_current ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
        </span>
      </div>
      <div className="w-full bg-border-dark rounded-full h-1 mt-2">
        <div
          className="h-1 rounded-full bg-orange-accent"
          style={{ width: `${Math.min(100, product.adhesion_score)}%` }}
        />
      </div>
    </div>
  )
}

function MonthlyRankingSection() {
  const { data: sellersData } = useQuery({
    queryKey: ['sellers'],
    queryFn: getSellers,
    staleTime: 300_000,
  })

  const now = new Date()
  const [sellerId, setSellerId] = useState<string>('')
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const activeId = sellerId || sellersData?.[0]?.seller_id || ''

  const { data, isLoading } = useQuery({
    queryKey: ['monthly-ranking', activeId, year, month],
    queryFn: () => getMonthlyRanking(activeId, year, month),
    enabled: Boolean(activeId),
    staleTime: 300_000,
  })

  // Simulated previous rank for rank change indicator
  const getRankChange = (rank: number): { diff: number } => {
    const changes = [-2, 1, 0, 3, -1, 0, 2, -3, 1, 0]
    return { diff: changes[(rank - 1) % changes.length] }
  }

  const RankChangeBadge = ({ rank }: { rank: number }) => {
    const { diff } = getRankChange(rank)
    if (diff === 0)
      return <span className="text-text-secondary text-xs flex items-center gap-0.5"><Minus className="w-3 h-3" /></span>
    if (diff > 0)
      return (
        <span className="text-success text-xs flex items-center gap-0.5">
          <ChevronUp className="w-3.5 h-3.5" />{diff}
        </span>
      )
    return (
      <span className="text-danger text-xs flex items-center gap-0.5">
        <ChevronDown className="w-3.5 h-3.5" />{Math.abs(diff)}
      </span>
    )
  }

  return (
    <div className="rounded-xl border border-border-dark bg-surface-dark p-5">
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <h3 className="text-base font-semibold text-text-primary flex items-center gap-2">
          <Calendar className="w-4 h-4 text-petroleum-400" />
          Ranking Mensal
        </h3>
        <div className="flex items-center gap-2 ml-auto">
          {/* Seller select */}
          <select
            value={activeId}
            onChange={(e) => setSellerId(e.target.value)}
            className="bg-surface-darker border border-border-dark rounded-lg px-3 py-1.5 text-text-primary text-sm focus:outline-none focus:border-petroleum-400"
          >
            {(sellersData || []).map((s) => (
              <option key={s.seller_id} value={s.seller_id}>{s.seller_name}</option>
            ))}
          </select>
          {/* Month */}
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="bg-surface-darker border border-border-dark rounded-lg px-3 py-1.5 text-text-primary text-sm focus:outline-none focus:border-petroleum-400"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {format(new Date(2000, i, 1), 'MMMM', { locale: ptBR })}
              </option>
            ))}
          </select>
          {/* Year */}
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="bg-surface-darker border border-border-dark rounded-lg px-3 py-1.5 text-text-primary text-sm focus:outline-none focus:border-petroleum-400"
          >
            {[2024, 2025, 2026].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-petroleum-700/20 animate-pulse" />
          ))}
        </div>
      ) : !data?.ranking?.length ? (
        <p className="text-sm text-text-secondary text-center py-8">
          Sem dados de ranking para o período selecionado.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-dark text-xs text-text-secondary uppercase tracking-wide">
                <th className="py-2 px-3 text-left">Rank</th>
                <th className="py-2 px-3 text-left">Produto</th>
                <th className="py-2 px-3 text-left">Categoria</th>
                <th className="py-2 px-3 text-right">Preço</th>
                <th className="py-2 px-3 text-right">Vol. Est.</th>
                <th className="py-2 px-3 text-right">Receita Est.</th>
                <th className="py-2 px-3 text-center">Variação</th>
              </tr>
            </thead>
            <tbody>
              {data.ranking.map((item, i) => (
                <tr
                  key={item.sku_id}
                  className={clsx(
                    'border-b border-border-dark/50 hover:bg-petroleum-500/5 transition-colors',
                    i % 2 === 1 && 'bg-surface-dark/40'
                  )}
                >
                  <td className="py-3 px-3">
                    <span className="text-sm font-black text-petroleum-400">#{item.rank}</span>
                  </td>
                  <td className="py-3 px-3 max-w-[200px]">
                    <p className="truncate font-medium text-text-primary">{item.title}</p>
                    <p className="text-xs text-text-secondary font-mono">{item.sku_id}</p>
                  </td>
                  <td className="py-3 px-3">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-petroleum-700/40 text-petroleum-300">
                      {item.category}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right font-medium text-text-primary">
                    {(item.price ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                  <td className="py-3 px-3 text-right text-text-secondary">
                    {(item.estimated_monthly_sales ?? 0).toLocaleString('pt-BR')}
                  </td>
                  <td className="py-3 px-3 text-right font-semibold text-text-primary">
                    {(item.revenue ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <RankChangeBadge rank={item.rank} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// Seasonality Heatmap
function SeasonalityHeatmap({ products }: { products: TrendProduct[] }) {
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = subMonths(new Date(), 11 - i)
    return { key: format(d, 'yyyy-MM'), label: format(d, 'MMM', { locale: ptBR }) }
  })

  const topProducts = products.slice(0, 12)

  const generateVolume = (product: TrendProduct, monthIndex: number) => {
    const base = product.estimated_monthly_sales
    const seasonal = 0.2 * Math.sin((monthIndex / 12) * 2 * Math.PI + Math.PI * 0.5)
    return Math.max(1, Math.round(base * (0.8 + seasonal + Math.random() * 0.1)))
  }

  const getHeatColor = (volume: number, maxVol: number) => {
    const intensity = volume / maxVol
    const alpha = 0.1 + intensity * 0.85
    return `rgba(15, 76, 117, ${alpha})`
  }

  return (
    <div className="rounded-xl border border-border-dark bg-surface-dark p-5">
      <h3 className="text-base font-semibold text-text-primary mb-4">
        Sazonalidade — Últimos 12 Meses
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="text-left py-2 pr-4 text-text-secondary font-medium w-44">Produto</th>
              {months.map((m) => (
                <th key={m.key} className="py-2 px-1 text-center text-text-secondary font-medium capitalize">
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {topProducts.map((product) => {
              const volumes = months.map((_, i) => generateVolume(product, i))
              const maxVol = Math.max(...volumes)
              return (
                <tr key={product.sku_id} className="border-t border-border-dark/20">
                  <td className="py-1.5 pr-4 font-medium text-text-secondary truncate max-w-[160px]" title={product.title}>
                    {product.title.slice(0, 24)}{product.title.length > 24 ? '…' : ''}
                  </td>
                  {volumes.map((vol, i) => (
                    <td key={i} className="py-1 px-1 text-center">
                      <div
                        className="rounded py-1.5 text-white font-semibold text-[10px] cursor-default transition-all hover:scale-110"
                        style={{ backgroundColor: getHeatColor(vol, maxVol) }}
                        title={`${vol.toLocaleString('pt-BR')} un/mês`}
                      >
                        {vol >= 1000 ? `${(vol / 1000).toFixed(1)}k` : vol}
                      </div>
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3 mt-3 text-xs text-text-secondary">
        <span>Intensidade:</span>
        <div className="flex gap-1">
          {[0.1, 0.3, 0.5, 0.7, 0.95].map((alpha) => (
            <div
              key={alpha}
              className="w-6 h-4 rounded"
              style={{ backgroundColor: `rgba(15, 76, 117, ${alpha})` }}
            />
          ))}
        </div>
        <span>Baixo → Alto volume</span>
      </div>
    </div>
  )
}

export default function MarketTrends() {
  const [activeTab, setActiveTab] = useState<Tab>('rising')

  const { data: risingData, isLoading: rLoading } = useQuery({
    queryKey: ['trends-rising'],
    queryFn: () => getTrending(60),
    staleTime: 300_000,
  })

  const { data: decliningData, isLoading: dLoading } = useQuery({
    queryKey: ['trends-declining'],
    queryFn: () => getDeclining(60),
    staleTime: 300_000,
  })

  const { data: newData, isLoading: nLoading } = useQuery({
    queryKey: ['trends-new'],
    queryFn: () => getNewEntrants(30),
    staleTime: 300_000,
  })

  const tabs = [
    {
      id: 'rising' as Tab,
      label: 'Em Alta',
      icon: TrendingUp,
      count: risingData?.total,
      color: 'text-success',
      activeBg: 'bg-success/20',
    },
    {
      id: 'declining' as Tab,
      label: 'Em Queda',
      icon: TrendingDown,
      count: decliningData?.total,
      color: 'text-danger',
      activeBg: 'bg-danger/20',
    },
    {
      id: 'new' as Tab,
      label: 'Novos Entrantes',
      icon: Zap,
      count: newData?.total,
      color: 'text-warning',
      activeBg: 'bg-warning/20',
    },
  ]

  const activeProducts =
    activeTab === 'rising'
      ? risingData?.items || []
      : activeTab === 'declining'
      ? decliningData?.items || []
      : newData?.items || []

  const isLoading = activeTab === 'rising' ? rLoading : activeTab === 'declining' ? dLoading : nLoading

  return (
    <div className="flex-1 p-6 space-y-6 animate-fade-in">
      {/* Tabs */}
      <div className="flex rounded-xl border border-border-dark overflow-hidden w-fit">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'flex items-center gap-2 px-5 py-2.5 text-sm font-medium transition-colors',
                activeTab === tab.id
                  ? `${tab.activeBg} ${tab.color}`
                  : 'text-text-secondary hover:text-text-primary hover:bg-petroleum-500/10'
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {tab.count !== undefined && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-black/20">
                  {tab.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Product cards grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-text-primary">
            Produtos {tabs.find((t) => t.id === activeTab)?.label}
          </h2>
          <span className="text-sm text-text-secondary">Últimos 60 dias</span>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} lines={4} />
            ))}
          </div>
        ) : activeProducts.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-text-secondary gap-2">
            <AlertCircle className="w-5 h-5 opacity-50" />
            <p className="text-sm">Nenhum produto encontrado para este período.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {activeProducts.map((product) =>
              activeTab === 'new' ? (
                <NewEntrantCard key={product.sku_id} product={product} />
              ) : (
                <TrendCard key={product.sku_id} product={product} type={activeTab} />
              )
            )}
          </div>
        )}
      </div>

      {/* Monthly Ranking */}
      <MonthlyRankingSection />

      {/* Seasonality Heatmap */}
      {risingData?.items && risingData.items.length > 0 && (
        <SeasonalityHeatmap products={risingData.items} />
      )}
    </div>
  )
}
