import clsx from 'clsx'

interface Props {
  size?: 'sm' | 'md' | 'lg'
  message?: string
  fullPage?: boolean
}

export default function LoadingSpinner({ size = 'md', message, fullPage = false }: Props) {
  const sizeClass = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-2',
    lg: 'w-12 h-12 border-3',
  }[size]

  const spinner = (
    <div className="flex flex-col items-center gap-3">
      <div
        className={clsx(
          'rounded-full border-petroleum-500 border-t-transparent animate-spin',
          sizeClass
        )}
        style={{ borderWidth: size === 'lg' ? 3 : 2 }}
      />
      {message && (
        <p className="text-sm text-text-secondary animate-pulse">{message}</p>
      )}
    </div>
  )

  if (fullPage) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-surface-darker/80 z-50">
        {spinner}
      </div>
    )
  }

  return spinner
}

// Skeleton loader for cards
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-xl border border-border-dark bg-surface-dark p-5 animate-pulse">
      <div className="h-4 bg-petroleum-700 rounded w-1/3 mb-4" />
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-3 bg-petroleum-700/60 rounded mb-2"
          style={{ width: `${85 - i * 15}%` }}
        />
      ))}
    </div>
  )
}

// Skeleton table row
export function SkeletonRow({ cols = 5 }: { cols?: number }) {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-3 bg-petroleum-700/60 rounded" style={{ width: `${60 + i * 5}%` }} />
        </td>
      ))}
    </tr>
  )
}
