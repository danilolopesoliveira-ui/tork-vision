import { useLocation } from 'react-router-dom'
import { Plus, ChevronDown, Clock, Sun, Moon } from 'lucide-react'
import { useState } from 'react'
import clsx from 'clsx'
import { useAppContext } from '../context/AppContext'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const ROUTE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/competitors': 'Análise de Concorrentes',
  '/matrix': 'Quadrante Preço×Volume',
  '/top-products': 'Top 20 Produtos',
  '/revenue': 'Estimativa de Faturamento',
  '/trends': 'Tendências de Mercado',
}

const MARKETPLACE_LABELS: Record<string, string> = {
  mercadolivre: 'Mercado Livre',
  shopee: 'Shopee',
  amazon: 'Amazon',
  magalu: 'Magazine Luiza',
  americanas: 'Americanas',
}

export default function Header() {
  const { pathname } = useLocation()
  const { sellers, selectedSellerId, setSelectedSellerId, theme, toggleTheme, setShowURLModal } =
    useAppContext()
  const [sellerDropdown, setSellerDropdown] = useState(false)

  const title = ROUTE_TITLES[pathname] || 'Tork Vision'
  const selectedSeller = sellers.find((s) => s.seller_id === selectedSellerId)
  const now = format(new Date(), "dd 'de' MMM, yyyy", { locale: ptBR })

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-border-dark bg-surface-dark/80 backdrop-blur-sm sticky top-0 z-30">
      {/* Left: title */}
      <div className="flex items-center gap-4">
        <div className="pl-10 lg:pl-0">
          <h1 className="text-lg font-bold text-text-primary">{title}</h1>
          <div className="flex items-center gap-1.5 text-xs text-text-secondary mt-0.5">
            <Clock className="w-3 h-3" />
            <span>{now}</span>
          </div>
        </div>
      </div>

      {/* Right: seller selector + actions */}
      <div className="flex items-center gap-3">
        {/* Seller selector */}
        {sellers.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setSellerDropdown((o) => !o)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border-dark bg-surface-darker hover:border-petroleum-400 transition-colors"
            >
              <div className="w-2 h-2 rounded-full bg-success animate-pulse-slow" />
              <span className="text-sm font-medium text-text-primary">
                {selectedSeller?.seller_name || 'Selecionar loja'}
              </span>
              {selectedSeller && (
                <span className="text-xs text-text-secondary">
                  {MARKETPLACE_LABELS[selectedSeller.marketplace] || selectedSeller.marketplace}
                </span>
              )}
              <ChevronDown
                className={clsx(
                  'w-4 h-4 text-text-secondary transition-transform',
                  sellerDropdown && 'rotate-180'
                )}
              />
            </button>

            {sellerDropdown && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-surface-dark border border-border-dark rounded-xl shadow-card py-1 z-50">
                {sellers.map((seller) => (
                  <button
                    key={seller.seller_id}
                    onClick={() => {
                      setSelectedSellerId(seller.seller_id)
                      setSellerDropdown(false)
                    }}
                    className={clsx(
                      'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                      selectedSellerId === seller.seller_id
                        ? 'bg-petroleum-500/20 text-text-primary'
                        : 'text-text-secondary hover:bg-petroleum-500/10 hover:text-text-primary'
                    )}
                  >
                    <div className="w-8 h-8 rounded-lg bg-petroleum-700 flex items-center justify-center text-xs font-bold text-petroleum-300 flex-shrink-0">
                      {seller.seller_name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{seller.seller_name}</p>
                      <p className="text-xs text-text-secondary/70">
                        {seller.total_skus} SKUs ·{' '}
                        {MARKETPLACE_LABELS[seller.marketplace] || seller.marketplace}
                      </p>
                    </div>
                    {selectedSellerId === seller.seller_id && (
                      <div className="w-1.5 h-1.5 rounded-full bg-success" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg border border-border-dark text-text-secondary hover:text-text-primary hover:border-petroleum-400 transition-colors"
          title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Nova análise */}
        <button
          onClick={() => setShowURLModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-orange-accent hover:bg-orange-light text-white font-semibold text-sm rounded-xl transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nova Análise</span>
        </button>
      </div>
    </header>
  )
}
