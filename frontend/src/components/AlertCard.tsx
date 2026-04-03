import { X, AlertTriangle, TrendingDown, TrendingUp, Info, Bell } from 'lucide-react'
import clsx from 'clsx'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

type AlertType = 'warning' | 'danger' | 'success' | 'info'

interface Props {
  type?: AlertType
  alert_type?: string
  message: string
  detected_at?: string
  title?: string
  onDismiss?: () => void
  compact?: boolean
}

function inferType(alertType?: string): AlertType {
  if (!alertType) return 'info'
  if (alertType.includes('drop') || alertType.includes('danger') || alertType.includes('alert')) return 'danger'
  if (alertType.includes('surge') || alertType.includes('rising') || alertType.includes('success')) return 'success'
  if (alertType.includes('gap') || alertType.includes('warn') || alertType.includes('new')) return 'warning'
  return 'info'
}

export default function AlertCard({
  type,
  alert_type,
  message,
  detected_at,
  title,
  onDismiss,
  compact = false,
}: Props) {
  const resolvedType = type || inferType(alert_type)

  const config = {
    warning: {
      border: 'border-l-warning',
      bg: 'bg-warning/5',
      icon: <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />,
      titleColor: 'text-warning',
    },
    danger: {
      border: 'border-l-danger',
      bg: 'bg-danger/5',
      icon: <TrendingDown className="w-4 h-4 text-danger flex-shrink-0" />,
      titleColor: 'text-danger',
    },
    success: {
      border: 'border-l-success',
      bg: 'bg-success/5',
      icon: <TrendingUp className="w-4 h-4 text-success flex-shrink-0" />,
      titleColor: 'text-success',
    },
    info: {
      border: 'border-l-petroleum-400',
      bg: 'bg-petroleum-500/5',
      icon: <Info className="w-4 h-4 text-petroleum-400 flex-shrink-0" />,
      titleColor: 'text-petroleum-400',
    },
  }[resolvedType]

  const timeAgo = detected_at
    ? formatDistanceToNow(new Date(detected_at), { addSuffix: true, locale: ptBR })
    : null

  return (
    <div
      className={clsx(
        'border-l-4 rounded-r-lg flex items-start gap-3 transition-all',
        config.border,
        config.bg,
        compact ? 'p-3' : 'p-4'
      )}
    >
      <div className="mt-0.5">{config.icon}</div>
      <div className="flex-1 min-w-0">
        {title && (
          <p className={clsx('text-xs font-semibold uppercase tracking-wide mb-1', config.titleColor)}>
            {title}
          </p>
        )}
        <p className="text-sm text-text-primary leading-relaxed">{message}</p>
        {timeAgo && (
          <p className="text-xs text-text-secondary mt-1">{timeAgo}</p>
        )}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-text-secondary hover:text-text-primary transition-colors flex-shrink-0"
          aria-label="Fechar alerta"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}

// Empty state for alerts
export function NoAlerts() {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-text-secondary">
      <Bell className="w-8 h-8 opacity-40" />
      <p className="text-sm">Nenhum alerta ativo</p>
    </div>
  )
}
