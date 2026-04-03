import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Package,
  Users,
  Briefcase,
  TrendingUp,
  AlertTriangle,
  Link,
  Loader2,
  CheckCircle,
} from 'lucide-react'
import clsx from 'clsx'
import {
  ResponsiveContainer,
  RadialBarChart,
  RadialBar,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from 'recharts'
import { getDashboard, getDashboardAlerts, getPriceHeatmap } from '../api/endpoints'
import { useAppContext } from '../context/AppContext'
import KPICard from '../components/KPICard'
import AlertCard, { NoAlerts } from '../components/AlertCard'
import { SkeletonCard } from '../components/LoadingSpinner'
import URLInputModal from '../components/URLInputModal'

function CompetitivenessGauge({ score }: { score: number }) {
  const color =
    score >= 70 ? '#00D4AA' : score >= 40 ? '#FFB800' : '#FF4444'
  const data = [{ value: score, fill: color }]

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-36 h-36">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius="70%"
            outerRadius="90%"
            startAngle={220}
            endAngle={-40}
            data={[{ value: 100, fill: '#1E3A5F' }, ...data]}
          >
            <RadialBar dataKey="value" cornerRadius={4} background={false} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-black" style={{ color }}>
            {score.toFixed(0)}
          </span>
          <span className="text-xs text-text-secondary">/ 100</span>
        </div>
      </div>
      <p
        className="text-sm font-semibold mt-1"
        style={{ color }}
      >
        {score >= 70 ? 'Alta Competitividade' : score >= 40 ? 'Competitividade Média' : 'Baixa Competitividade'}
      </p>
    </div>
  )
}

function PriceHeatmap() {
  const { data, isLoading } = useQuery({
    queryKey: ['heatmap'],
    queryFn: getPriceHeatmap,
    staleTime: 300_000,
  })

  if (isLoading) return <SkeletonCard lines={6} />

  const entries = data?.data || []
  const categories = [...new Set(entries.map((e) => e.category))].slice(0, 8)
  const sellers = [...new Set(entries.map((e) => e.seller_name))].slice(0, 5)

  const getEntry = (cat: string, seller: string) =>
    entries.find((e) => e.category === cat && e.seller_name === seller)

  const getCellColor = (pct: number | undefined) => {
    if (pct === undefined) return 'bg-border-dark/30'
    if (pct > 5) return 'bg-success/70'
    if (pct > 2) return 'bg-success/30'
    if (pct > -2) return 'bg-warning/20'
    if (pct > -5) return 'bg-danger/20'
    return 'bg-danger/50'
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="text-left py-2 pr-4 text-text-secondary font-medium">Categoria</th>
            {sellers.map((s) => (
              <th key={s} className="py-2 px-2 text-center text-text-secondary font-medium whitespace-nowrap">
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((cat) => (
            <tr key={cat} className="border-t border-border-dark/30">
              <td className="py-2 pr-4 text-text-secondary font-medium truncate max-w-[120px]">
                {cat}
              </td>
              {sellers.map((seller) => {
                const entry = getEntry(cat, seller)
                return (
                  <td key={seller} className="py-1 px-2 text-center">
                    <div
                      className={clsx(
                        'rounded py-1 px-2 font-semibold transition-all cursor-default',
                        getCellColor(entry?.price_competitiveness_pct)
                      )}
                      title={
                        entry
                          ? `${entry.price_competitiveness_pct > 0 ? '+' : ''}${entry.price_competitiveness_pct.toFixed(1)}% vs média`
                          : 'Sem dados'
                      }
                    >
                      {entry
                        ? `${entry.price_competitiveness_pct > 0 ? '+' : ''}${entry.price_competitiveness_pct.toFixed(1)}%`
                        : '—'}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-4 mt-3 text-xs text-text-secondary">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-success/70" />
          <span>Muito competitivo (&gt;5%)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-warning/20" />
          <span>Na média</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-danger/50" />
          <span>Acima da média (&gt;5%)</span>
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { selectedSellerId, setShowURLModal } = useAppContext()
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<number>>(new Set())

  const {
    data: dashboard,
    isLoading: dashLoading,
    isError: dashError,
  } = useQuery({
    queryKey: ['dashboard', selectedSellerId],
    queryFn: () => getDashboard(selectedSellerId!),
    enabled: Boolean(selectedSellerId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })

  const { data: alerts } = useQuery({
    queryKey: ['alerts', selectedSellerId],
    queryFn: () => getDashboardAlerts(selectedSellerId!),
    enabled: Boolean(selectedSellerId),
    staleTime: 60_000,
  })

  // No seller selected — show URL input CTA
  if (!selectedSellerId) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-xl text-center animate-fade-in">
          <div className="w-20 h-20 rounded-2xl bg-petroleum-500/20 flex items-center justify-center mx-auto mb-6">
            <Link className="w-10 h-10 text-petroleum-400" />
          </div>
          <h2 className="text-2xl font-bold text-text-primary mb-2">Analisar Loja</h2>
          <p className="text-text-secondary mb-8 leading-relaxed">
            Cole a URL de uma loja para iniciar a análise de inteligência competitiva.
            Suportamos Mercado Livre, Shopee, Amazon, Magazine Luiza e Americanas.
          </p>
          <button
            onClick={() => setShowURLModal(true)}
            className="px-8 py-3 bg-orange-accent hover:bg-orange-light text-white font-bold rounded-xl text-base transition-colors shadow-glow-orange"
          >
            Analisar Loja
          </button>
          <p className="mt-4 text-xs text-text-secondary">
            Ou aguarde — carregando dados de demonstração...
          </p>
        </div>
      </div>
    )
  }

  const kpis = dashboard?.kpis

  const allAlerts = [
    ...(alerts?.price_alerts || []),
    ...(alerts?.significant_price_changes?.map((c) => ({
      alert_type: c.direction === 'down' ? 'price-drop' : 'price-surge',
      sku_id: c.sku_id,
      seller_id: '',
      severity: 'medium' as const,
      message: `${c.title}: preço ${c.direction === 'down' ? 'caiu' : 'subiu'} ${Math.abs(c.change_pct ?? 0).toFixed(1)}% (de ${(c.old_price ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} para ${(c.new_price ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`,
      detected_at: c.detected_at,
    })) || []),
    ...(alerts?.market_alerts?.map((a) => ({
      alert_type: 'new_entrant',
      sku_id: '',
      seller_id: '',
      severity: a.severity as 'medium',
      message: a.message,
      detected_at: new Date().toISOString(),
    })) || []),
  ].filter((_, i) => !dismissedAlerts.has(i))

  const categoryData = (dashboard?.category_breakdown || []).slice(0, 6).map((c) => ({
    name: c.category.length > 12 ? c.category.slice(0, 12) + '…' : c.category,
    skus: c.sku_count,
    revenue: Math.round(c.total_revenue_est || 0),
  }))

  return (
    <div className="flex-1 p-6 space-y-6 animate-fade-in">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total SKUs Analisados"
          value={kpis?.total_skus || 0}
          icon={Package}
          trend={kpis?.revenue_vs_last_month_pct && kpis.revenue_vs_last_month_pct > 0 ? 'up' : 'neutral'}
          trendValue={Math.abs(kpis?.revenue_vs_last_month_pct || 0)}
          color="blue"
          format="number"
          loading={dashLoading}
        />
        <KPICard
          title="Concorrentes Diretos"
          value={kpis?.direct_competitors_count || 0}
          icon={Users}
          color="orange"
          format="number"
          subtitle={`+ ${kpis?.indirect_competitors_count || 0} indiretos`}
          loading={dashLoading}
        />
        <KPICard
          title="Alertas de Preço"
          value={kpis?.price_alerts_count || 0}
          icon={AlertTriangle}
          color="red"
          format="number"
          loading={dashLoading}
        />
        <KPICard
          title="Faturamento Est. / Mês"
          value={kpis?.total_estimated_revenue || 0}
          icon={TrendingUp}
          trend={
            (kpis?.revenue_vs_last_month_pct || 0) > 0
              ? 'up'
              : (kpis?.revenue_vs_last_month_pct || 0) < 0
              ? 'down'
              : 'neutral'
          }
          trendValue={Math.abs(kpis?.revenue_vs_last_month_pct || 0)}
          color="green"
          format="currency"
          loading={dashLoading}
        />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Alerts */}
        <div className="lg:col-span-2 rounded-xl border border-border-dark bg-surface-dark p-5">
          <h3 className="text-base font-semibold text-text-primary mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-warning" />
            Alertas Automáticos
            {allAlerts.length > 0 && (
              <span className="ml-auto text-xs bg-danger/20 text-danger px-2 py-0.5 rounded-full font-medium">
                {allAlerts.length}
              </span>
            )}
          </h3>
          {dashLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 rounded-lg bg-petroleum-700/30 animate-pulse" />
              ))}
            </div>
          ) : allAlerts.length === 0 ? (
            <NoAlerts />
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {allAlerts.map((alert, i) => (
                <AlertCard
                  key={i}
                  alert_type={alert.alert_type}
                  message={alert.message}
                  detected_at={alert.detected_at}
                  onDismiss={() => setDismissedAlerts((prev) => new Set([...prev, i]))}
                  compact
                />
              ))}
            </div>
          )}
        </div>

        {/* Competitiveness Index */}
        <div className="rounded-xl border border-border-dark bg-surface-dark p-5">
          <h3 className="text-base font-semibold text-text-primary mb-4 flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-petroleum-400" />
            Índice de Competitividade
          </h3>
          {dashLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-8 h-8 animate-spin text-petroleum-400" />
            </div>
          ) : (
            <>
              <CompetitivenessGauge score={kpis?.competitiveness_index || 0} />
              {categoryData.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs text-text-secondary mb-2 uppercase tracking-wide">
                    SKUs por Categoria
                  </p>
                  <ResponsiveContainer width="100%" height={120}>
                    <BarChart data={categoryData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                      <XAxis dataKey="name" tick={{ fill: '#8AA8C0', fontSize: 9 }} tickLine={false} axisLine={false} />
                      <YAxis hide />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0D1B2A',
                          border: '1px solid #1E3A5F',
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        labelStyle={{ color: '#E8F4F8' }}
                      />
                      <Bar dataKey="skus" radius={[3, 3, 0, 0]}>
                        {categoryData.map((_, i) => (
                          <Cell key={i} fill={['#0F4C75', '#FF6B35', '#00D4AA', '#FFB800', '#A855F7', '#06B6D4'][i % 6]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Price Heatmap */}
      <div className="rounded-xl border border-border-dark bg-surface-dark p-5">
        <h3 className="text-base font-semibold text-text-primary mb-4">
          Mapa de Calor de Preços — Competitividade por Categoria
        </h3>
        {dashError ? (
          <p className="text-sm text-danger">Erro ao carregar dados do dashboard.</p>
        ) : (
          <PriceHeatmap />
        )}
      </div>

      {/* Top SKUs preview */}
      {dashboard?.top_skus && dashboard.top_skus.length > 0 && (
        <div className="rounded-xl border border-border-dark bg-surface-dark p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-text-primary">Top SKUs</h3>
            <a href="/top-products" className="text-xs text-petroleum-400 hover:text-petroleum-300 transition-colors">
              Ver todos →
            </a>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {dashboard.top_skus.map((sku) => (
              <div
                key={sku.id}
                className="p-3 rounded-lg border border-border-dark/60 bg-surface-darker hover:border-petroleum-400 transition-colors"
              >
                <p className="text-sm font-medium text-text-primary line-clamp-2 mb-2">{sku.title}</p>
                <div className="flex items-center justify-between text-xs text-text-secondary">
                  <span className="px-1.5 py-0.5 rounded bg-petroleum-700/50 text-petroleum-300">
                    {sku.category}
                  </span>
                  <span className="font-semibold text-text-primary">
                    {(sku.price_current ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
