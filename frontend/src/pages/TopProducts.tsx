import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutGrid,
  List,
  Star,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Smartphone,
  Home,
  ShoppingBag,
  Sparkles,
  Dumbbell,
  BookOpen,
  Package,
} from 'lucide-react'
import clsx from 'clsx'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts'
import { getTopProducts, getSkuPriceHistory } from '../api/endpoints'
import FilterBar from '../components/FilterBar'
import DataTable from '../components/DataTable'
import { SkeletonCard } from '../components/LoadingSpinner'
import { useFilters } from '../hooks/useFilters'
import type { TopProduct } from '../types'
import { format, parseISO, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  Eletrônicos: Smartphone,
  Casa: Home,
  Moda: ShoppingBag,
  Beleza: Sparkles,
  Esporte: Dumbbell,
  Livros: BookOpen,
}

function getCategoryIcon(cat: string) {
  return CATEGORY_ICONS[cat] || Package
}

function AdhesionBadge({ score }: { score: number }) {
  const color =
    score >= 70 ? 'text-success bg-success/15' : score >= 40 ? 'text-warning bg-warning/15' : 'text-danger bg-danger/15'
  return (
    <div className={clsx('flex flex-col items-center px-2.5 py-1 rounded-lg', color)}>
      <span className="text-xl font-black leading-none">{score.toFixed(0)}</span>
      <span className="text-[9px] uppercase tracking-wider font-semibold">Adesão</span>
    </div>
  )
}

function MiniPriceChart({ skuId, sellerName }: { skuId: string; sellerName: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['price-history', skuId, 90],
    queryFn: () => getSkuPriceHistory(skuId, 90),
    staleTime: 300_000,
  })

  if (isLoading) {
    return <div className="h-28 rounded bg-petroleum-700/20 animate-pulse" />
  }

  const grouped: Record<string, number> = {}
  for (const h of data?.history || []) {
    const day = h.recorded_at.slice(0, 10)
    if (!grouped[day]) grouped[day] = h.price
  }
  const chartData = Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-18)
    .map(([date, price]) => ({ date, [sellerName]: price }))

  if (chartData.length === 0) {
    return (
      <div className="h-28 flex items-center justify-center text-text-secondary/40 text-xs">
        Sem histórico
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={112}>
      <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
        <XAxis
          dataKey="date"
          tickFormatter={(v) => {
            try { return format(parseISO(v), 'MMM', { locale: ptBR }) } catch { return v }
          }}
          tick={{ fill: '#8AA8C0', fontSize: 9 }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis hide />
        <Tooltip
          contentStyle={{
            backgroundColor: '#0D1B2A',
            border: '1px solid #1E3A5F',
            borderRadius: 8,
            fontSize: 11,
          }}
          formatter={(v: number) => [v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), sellerName]}
          labelFormatter={(l) => {
            try { return format(parseISO(l), 'dd/MM/yyyy', { locale: ptBR }) } catch { return l }
          }}
        />
        <Line
          type="monotone"
          dataKey={sellerName}
          stroke="#FF6B35"
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

function ProductCard({ product, rank }: { product: TopProduct; rank: number }) {
  const [expanded, setExpanded] = useState(false)
  const Icon = getCategoryIcon(product.category)

  return (
    <div className="rounded-xl border border-border-dark bg-surface-dark hover:border-petroleum-400 transition-all duration-200">
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <div className="w-8 h-8 rounded-lg bg-petroleum-700/50 flex items-center justify-center flex-shrink-0">
            <Icon className="w-4 h-4 text-petroleum-300" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <span className="text-xs text-text-secondary/60 font-mono">#{rank}</span>
                <p className="text-sm font-semibold text-text-primary line-clamp-2 leading-snug">
                  {product.title}
                </p>
              </div>
              <AdhesionBadge score={product.adhesion_score} />
            </div>
          </div>
        </div>

        {/* Category badge */}
        <div className="mb-3">
          <span className="text-xs px-2 py-0.5 rounded-full bg-petroleum-700/40 text-petroleum-300">
            {product.category}
          </span>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
          <div>
            <p className="text-text-secondary">Preço</p>
            <p className="font-semibold text-text-primary">
              {(product.price_current ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
          </div>
          <div>
            <p className="text-text-secondary">⭐ Avaliação</p>
            <p className="font-semibold text-text-primary">{product.rating.toFixed(1)}</p>
          </div>
          <div>
            <p className="text-text-secondary">Vol./mês</p>
            <p className="font-semibold text-text-primary">
              {(product.estimated_monthly_sales ?? 0).toLocaleString('pt-BR')}
            </p>
          </div>
        </div>

        {/* Mini chart */}
        <div className="border-t border-border-dark/50 pt-3 mb-2">
          <MiniPriceChart skuId={product.sku_id} sellerName={product.seller_name} />
        </div>

        {/* Expand button */}
        <button
          onClick={() => setExpanded((e) => !e)}
          className="w-full flex items-center justify-center gap-1 text-xs text-text-secondary hover:text-text-primary transition-colors py-1"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" /> Fechar detalhes
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" /> Ver detalhes
            </>
          )}
        </button>
      </div>

      {/* Expanded seller info */}
      {expanded && (
        <div className="border-t border-border-dark/50 p-4 bg-surface-darker rounded-b-xl">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">
            Informações do Vendedor
          </p>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-petroleum-700 flex items-center justify-center text-xs font-bold text-petroleum-300">
              {product.seller_name.charAt(0)}
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary">{product.seller_name}</p>
              <p className="text-xs text-text-secondary">{product.marketplace}</p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-xs text-text-secondary">Preço atual</p>
              <p className="font-bold text-text-primary">
                {(product.price_current ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function TopProducts() {
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')
  const { filters, setCategory, setMinPrice, setMaxPrice, setMarketplace, clearFilters } = useFilters()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['top-products', filters.category, filters.marketplace],
    queryFn: () =>
      getTopProducts({
        limit: 20,
        category: filters.category || undefined,
        marketplace: filters.marketplace || undefined,
      }),
    staleTime: 300_000,
  })

  const products = data?.items || []

  const tableColumns = [
    {
      key: 'sku_id' as const,
      header: '#',
      width: 'w-12',
      render: (row: TopProduct) => (
        <span className="text-text-secondary font-mono text-sm">#{products.indexOf(row) + 1}</span>
      ),
    },
    {
      key: 'title' as const,
      header: 'Produto',
      render: (row: TopProduct) => (
        <div>
          <p className="font-medium text-text-primary line-clamp-1">{row.title}</p>
          <p className="text-xs text-text-secondary font-mono">{row.sku_id}</p>
        </div>
      ),
    },
    {
      key: 'category' as const,
      header: 'Categoria',
      render: (row: TopProduct) => (
        <span className="text-xs px-2 py-0.5 rounded-full bg-petroleum-700/40 text-petroleum-300">
          {row.category}
        </span>
      ),
    },
    {
      key: 'adhesion_score' as const,
      header: 'Score Adesão',
      sortable: true,
      align: 'center' as const,
      render: (row: TopProduct) => <AdhesionBadge score={row.adhesion_score} />,
    },
    {
      key: 'price_current' as const,
      header: 'Preço',
      sortable: true,
      render: (row: TopProduct) =>
        (row.price_current ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    },
    {
      key: 'rating' as const,
      header: 'Avaliação',
      sortable: true,
      align: 'center' as const,
      render: (row: TopProduct) => `⭐ ${row.rating.toFixed(1)}`,
    },
    {
      key: 'estimated_monthly_sales' as const,
      header: 'Vol./mês',
      sortable: true,
      render: (row: TopProduct) => (row.estimated_monthly_sales ?? 0).toLocaleString('pt-BR'),
    },
    {
      key: 'seller_name' as const,
      header: 'Vendedor',
      render: (row: TopProduct) => (
        <span className="text-text-secondary text-sm">{row.seller_name}</span>
      ),
    },
  ]

  return (
    <div className="flex-1 p-6 space-y-6 animate-fade-in">
      {/* Filters + View Toggle */}
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1">
          <FilterBar
            category={filters.category}
            onCategoryChange={setCategory}
            minPrice={filters.minPrice}
            maxPrice={filters.maxPrice}
            onMinPriceChange={setMinPrice}
            onMaxPriceChange={setMaxPrice}
            marketplace={filters.marketplace}
            onMarketplaceChange={setMarketplace}
            onClear={clearFilters}
            showPeriod={false}
            showMarketplace
          />
        </div>
        <div className="flex rounded-xl border border-border-dark overflow-hidden">
          <button
            onClick={() => setViewMode('grid')}
            className={clsx(
              'p-2.5 transition-colors',
              viewMode === 'grid'
                ? 'bg-petroleum-500 text-white'
                : 'text-text-secondary hover:text-text-primary'
            )}
            title="Visualização em grade"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={clsx(
              'p-2.5 transition-colors',
              viewMode === 'table'
                ? 'bg-petroleum-500 text-white'
                : 'text-text-secondary hover:text-text-primary'
            )}
            title="Visualização em tabela"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3">
        <Star className="w-5 h-5 text-warning" />
        <h2 className="text-base font-semibold text-text-primary">
          Top 20 Produtos por Score de Adesão
        </h2>
        <span className="ml-auto text-sm text-text-secondary">
          {products.length} produtos
        </span>
      </div>

      {isError ? (
        <div className="flex items-center justify-center py-16 text-danger gap-2">
          <AlertCircle className="w-6 h-6" />
          <p className="text-sm">Erro ao carregar produtos.</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} lines={5} />)
            : products.map((product, i) => (
                <ProductCard key={product.sku_id} product={product} rank={i + 1} />
              ))}
        </div>
      ) : (
        <DataTable
          columns={tableColumns.map((col) => ({
            ...col,
            render: col.render
              ? (row: Record<string, unknown>) =>
                  (col.render as (r: TopProduct) => React.ReactNode)(row as unknown as TopProduct)
              : undefined,
          })) as any}
          data={products as any[]}
          loading={isLoading}
          emptyMessage="Nenhum produto encontrado."
          getRowKey={(_, i) => i}
        />
      )}
    </div>
  )
}
