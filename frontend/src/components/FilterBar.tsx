import { useState } from 'react'
import { X, ChevronDown, Filter } from 'lucide-react'
import clsx from 'clsx'
import type { Period } from '../types'

const PERIODS: { value: Period; label: string }[] = [
  { value: '7d', label: '7d' },
  { value: '15d', label: '15d' },
  { value: '30d', label: '30d' },
  { value: '60d', label: '60d' },
  { value: '90d', label: '90d' },
]

const CATEGORIES = [
  'Eletrônicos',
  'Casa',
  'Moda',
  'Beleza',
  'Esporte',
  'Brinquedos',
  'Livros',
  'Alimentos',
]

const MARKETPLACES = [
  { value: 'mercadolivre', label: 'Mercado Livre' },
  { value: 'shopee', label: 'Shopee' },
  { value: 'amazon', label: 'Amazon' },
  { value: 'magalu', label: 'Magazine Luiza' },
  { value: 'americanas', label: 'Americanas' },
]

interface Props {
  period?: Period
  onPeriodChange?: (p: Period) => void
  category?: string | null
  onCategoryChange?: (c: string | null) => void
  minPrice?: number | null
  maxPrice?: number | null
  onMinPriceChange?: (v: number | null) => void
  onMaxPriceChange?: (v: number | null) => void
  marketplace?: string | null
  onMarketplaceChange?: (m: string | null) => void
  onClear?: () => void
  showPeriod?: boolean
  showCategory?: boolean
  showPrice?: boolean
  showMarketplace?: boolean
  extraCategories?: string[]
}

export default function FilterBar({
  period = '30d',
  onPeriodChange,
  category,
  onCategoryChange,
  minPrice,
  maxPrice,
  onMinPriceChange,
  onMaxPriceChange,
  marketplace,
  onMarketplaceChange,
  onClear,
  showPeriod = true,
  showCategory = true,
  showPrice = true,
  showMarketplace = false,
  extraCategories = [],
}: Props) {
  const [catOpen, setCatOpen] = useState(false)
  const [mktOpen, setMktOpen] = useState(false)

  const allCategories = [...new Set([...CATEGORIES, ...extraCategories])]
  const hasFilters = category || minPrice || maxPrice || marketplace

  return (
    <div className="flex flex-wrap items-center gap-3 p-4 bg-surface-dark rounded-xl border border-border-dark">
      <div className="flex items-center gap-1.5 text-text-secondary">
        <Filter className="w-4 h-4" />
        <span className="text-xs font-medium uppercase tracking-wide">Filtros</span>
      </div>

      {/* Period selector */}
      {showPeriod && onPeriodChange && (
        <div className="flex rounded-lg border border-border-dark overflow-hidden">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => onPeriodChange(p.value)}
              className={clsx(
                'px-3 py-1.5 text-xs font-medium transition-colors',
                period === p.value
                  ? 'bg-petroleum-500 text-white'
                  : 'text-text-secondary hover:text-text-primary hover:bg-petroleum-700/30'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* Category dropdown */}
      {showCategory && onCategoryChange && (
        <div className="relative">
          <button
            onClick={() => setCatOpen((o) => !o)}
            className={clsx(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors',
              category
                ? 'border-petroleum-400 bg-petroleum-500/20 text-petroleum-300'
                : 'border-border-dark text-text-secondary hover:border-petroleum-400 hover:text-text-primary'
            )}
          >
            <span>{category || 'Categoria'}</span>
            <ChevronDown className={clsx('w-3.5 h-3.5 transition-transform', catOpen && 'rotate-180')} />
          </button>
          {catOpen && (
            <div className="absolute top-full left-0 mt-1 z-20 w-48 bg-surface-dark border border-border-dark rounded-lg shadow-card py-1">
              <button
                onClick={() => { onCategoryChange(null); setCatOpen(false) }}
                className="w-full text-left px-3 py-2 text-xs text-text-secondary hover:bg-petroleum-500/10 hover:text-text-primary transition-colors"
              >
                Todas as categorias
              </button>
              {allCategories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => { onCategoryChange(cat); setCatOpen(false) }}
                  className={clsx(
                    'w-full text-left px-3 py-2 text-xs transition-colors',
                    category === cat
                      ? 'text-petroleum-300 bg-petroleum-500/20'
                      : 'text-text-secondary hover:bg-petroleum-500/10 hover:text-text-primary'
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Price range */}
      {showPrice && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-secondary">R$</span>
          <input
            type="number"
            placeholder="Mín"
            value={minPrice ?? ''}
            onChange={(e) => onMinPriceChange?.(e.target.value ? Number(e.target.value) : null)}
            className="w-20 px-2 py-1.5 rounded border border-border-dark bg-transparent text-xs text-text-primary placeholder-text-secondary/50 focus:outline-none focus:border-petroleum-400"
          />
          <span className="text-text-secondary text-xs">—</span>
          <input
            type="number"
            placeholder="Máx"
            value={maxPrice ?? ''}
            onChange={(e) => onMaxPriceChange?.(e.target.value ? Number(e.target.value) : null)}
            className="w-20 px-2 py-1.5 rounded border border-border-dark bg-transparent text-xs text-text-primary placeholder-text-secondary/50 focus:outline-none focus:border-petroleum-400"
          />
        </div>
      )}

      {/* Marketplace */}
      {showMarketplace && onMarketplaceChange && (
        <div className="relative">
          <button
            onClick={() => setMktOpen((o) => !o)}
            className={clsx(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors',
              marketplace
                ? 'border-petroleum-400 bg-petroleum-500/20 text-petroleum-300'
                : 'border-border-dark text-text-secondary hover:border-petroleum-400 hover:text-text-primary'
            )}
          >
            <span>
              {MARKETPLACES.find((m) => m.value === marketplace)?.label || 'Marketplace'}
            </span>
            <ChevronDown className={clsx('w-3.5 h-3.5 transition-transform', mktOpen && 'rotate-180')} />
          </button>
          {mktOpen && (
            <div className="absolute top-full left-0 mt-1 z-20 w-44 bg-surface-dark border border-border-dark rounded-lg shadow-card py-1">
              <button
                onClick={() => { onMarketplaceChange(null); setMktOpen(false) }}
                className="w-full text-left px-3 py-2 text-xs text-text-secondary hover:bg-petroleum-500/10 hover:text-text-primary transition-colors"
              >
                Todos
              </button>
              {MARKETPLACES.map((m) => (
                <button
                  key={m.value}
                  onClick={() => { onMarketplaceChange(m.value); setMktOpen(false) }}
                  className={clsx(
                    'w-full text-left px-3 py-2 text-xs transition-colors',
                    marketplace === m.value
                      ? 'text-petroleum-300 bg-petroleum-500/20'
                      : 'text-text-secondary hover:bg-petroleum-500/10 hover:text-text-primary'
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Clear button */}
      {hasFilters && onClear && (
        <button
          onClick={onClear}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-text-secondary hover:text-danger transition-colors border border-border-dark hover:border-danger"
        >
          <X className="w-3.5 h-3.5" />
          Limpar
        </button>
      )}
    </div>
  )
}
