import { useEffect, useRef, useState } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import clsx from 'clsx'
import type { LucideIcon } from 'lucide-react'

interface Props {
  title: string
  value: number | string
  unit?: string
  icon: LucideIcon
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: number
  color?: 'blue' | 'orange' | 'green' | 'red' | 'yellow'
  format?: 'number' | 'currency' | 'percent' | 'string'
  subtitle?: string
  loading?: boolean
}

function formatValue(val: number | string, format?: string): string {
  if (typeof val === 'string') return val
  switch (format) {
    case 'currency':
      return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    case 'percent':
      return `${val.toFixed(1)}%`
    case 'number':
      return val.toLocaleString('pt-BR')
    default:
      return typeof val === 'number' ? val.toLocaleString('pt-BR') : String(val)
  }
}

function useCountUp(target: number, duration = 800): number {
  const [current, setCurrent] = useState(0)
  const startRef = useRef<number | null>(null)
  const animRef = useRef<number>(0)

  useEffect(() => {
    setCurrent(0)
    startRef.current = null

    const animate = (timestamp: number) => {
      if (startRef.current === null) startRef.current = timestamp
      const elapsed = timestamp - startRef.current
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3) // ease-out cubic
      setCurrent(Math.floor(eased * target))
      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate)
      } else {
        setCurrent(target)
      }
    }

    animRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animRef.current)
  }, [target, duration])

  return current
}

export default function KPICard({
  title,
  value,
  unit,
  icon: Icon,
  trend,
  trendValue,
  color = 'blue',
  format = 'number',
  subtitle,
  loading = false,
}: Props) {
  const numericValue = typeof value === 'number' ? value : 0
  const animatedValue = useCountUp(numericValue)
  const displayValue =
    typeof value === 'number'
      ? formatValue(animatedValue, format)
      : formatValue(value, format)

  const colorMap = {
    blue: 'bg-petroleum-500/10 text-petroleum-400',
    orange: 'bg-orange-accent/10 text-orange-accent',
    green: 'bg-success/10 text-success',
    red: 'bg-danger/10 text-danger',
    yellow: 'bg-warning/10 text-warning',
  }

  const trendConfig =
    trend === 'up'
      ? { icon: TrendingUp, color: 'text-success', label: 'alta' }
      : trend === 'down'
      ? { icon: TrendingDown, color: 'text-danger', label: 'queda' }
      : { icon: Minus, color: 'text-text-secondary', label: 'estável' }

  if (loading) {
    return (
      <div className="rounded-xl border border-border-dark bg-surface-dark p-5 animate-pulse">
        <div className="flex items-start justify-between mb-4">
          <div className="w-10 h-10 rounded-lg bg-petroleum-700" />
          <div className="w-16 h-5 rounded bg-petroleum-700" />
        </div>
        <div className="h-7 bg-petroleum-700 rounded w-2/3 mb-2" />
        <div className="h-3 bg-petroleum-700/60 rounded w-1/2" />
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border-dark bg-surface-dark p-5 hover:shadow-card-hover transition-all duration-200 group animate-fade-in">
      <div className="flex items-start justify-between mb-4">
        <div className={clsx('p-2.5 rounded-lg', colorMap[color])}>
          <Icon className="w-5 h-5" />
        </div>
        {trend && trendValue !== undefined && (
          <div className={clsx('flex items-center gap-1 text-xs font-medium', trendConfig.color)}>
            <trendConfig.icon className="w-3.5 h-3.5" />
            <span>{Math.abs(trendValue).toFixed(1)}%</span>
          </div>
        )}
      </div>
      <div className="space-y-0.5">
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-bold text-text-primary">{displayValue}</span>
          {unit && <span className="text-sm text-text-secondary">{unit}</span>}
        </div>
        <p className="text-sm text-text-secondary font-medium">{title}</p>
        {subtitle && <p className="text-xs text-text-secondary/70">{subtitle}</p>}
      </div>
    </div>
  )
}
