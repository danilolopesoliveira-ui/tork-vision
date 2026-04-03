import { useState, useMemo } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
import clsx from 'clsx'
import { SkeletonRow } from './LoadingSpinner'

export interface Column<T> {
  key: keyof T | string
  header: string
  sortable?: boolean
  render?: (row: T) => React.ReactNode
  width?: string
  align?: 'left' | 'center' | 'right'
}

interface Props<T> {
  columns: Column<T>[]
  data: T[]
  loading?: boolean
  emptyMessage?: string
  rowsPerPageOptions?: number[]
  defaultRowsPerPage?: number
  onRowClick?: (row: T) => void
  getRowKey?: (row: T, index: number) => string | number
  striped?: boolean
  compact?: boolean
}

type SortDir = 'asc' | 'desc' | null

export default function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  loading = false,
  emptyMessage = 'Nenhum dado encontrado',
  rowsPerPageOptions = [10, 25, 50],
  defaultRowsPerPage = 10,
  onRowClick,
  getRowKey,
  striped = true,
  compact = false,
}: Props<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)
  const [page, setPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(defaultRowsPerPage)

  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc')
      else if (sortDir === 'desc') { setSortKey(null); setSortDir(null) }
      else setSortDir('asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
    setPage(1)
  }

  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return data
    return [...data].sort((a, b) => {
      const aVal = a[sortKey]
      const bVal = b[sortKey]
      if (aVal === null || aVal === undefined) return 1
      if (bVal === null || bVal === undefined) return -1
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal
      }
      const aStr = String(aVal).toLowerCase()
      const bStr = String(bVal).toLowerCase()
      const cmp = aStr.localeCompare(bStr)
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [data, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(sorted.length / rowsPerPage))
  const paginated = sorted.slice((page - 1) * rowsPerPage, page * rowsPerPage)

  const SortIcon = ({ col }: { col: Column<T> }) => {
    if (!col.sortable) return null
    const key = String(col.key)
    if (sortKey !== key) return <ChevronsUpDown className="w-3.5 h-3.5 text-text-secondary/40" />
    if (sortDir === 'asc') return <ChevronUp className="w-3.5 h-3.5 text-orange-accent" />
    return <ChevronDown className="w-3.5 h-3.5 text-orange-accent" />
  }

  const cellPad = compact ? 'px-3 py-2' : 'px-4 py-3'
  const headPad = compact ? 'px-3 py-2' : 'px-4 py-3'

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-xl border border-border-dark">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-dark bg-surface-dark">
              {columns.map((col) => (
                <th
                  key={String(col.key)}
                  className={clsx(
                    headPad,
                    'text-left font-semibold text-text-secondary uppercase tracking-wide text-xs select-none whitespace-nowrap',
                    col.sortable && 'cursor-pointer hover:text-text-primary transition-colors',
                    col.align === 'center' && 'text-center',
                    col.align === 'right' && 'text-right',
                    col.width && col.width
                  )}
                  onClick={() => col.sortable && handleSort(String(col.key))}
                >
                  <div
                    className={clsx(
                      'flex items-center gap-1.5',
                      col.align === 'center' && 'justify-center',
                      col.align === 'right' && 'justify-end'
                    )}
                  >
                    {col.header}
                    <SortIcon col={col} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: rowsPerPage > 5 ? 5 : rowsPerPage }).map((_, i) => (
                  <SkeletonRow key={i} cols={columns.length} />
                ))
              : paginated.length === 0
              ? (
                <tr>
                  <td colSpan={columns.length} className="text-center py-12 text-text-secondary">
                    {emptyMessage}
                  </td>
                </tr>
              )
              : paginated.map((row, idx) => (
                <tr
                  key={getRowKey ? getRowKey(row, idx) : idx}
                  className={clsx(
                    'border-b border-border-dark/50 transition-colors',
                    striped && idx % 2 === 1 ? 'bg-surface-dark/50' : 'bg-transparent',
                    onRowClick && 'cursor-pointer hover:bg-petroleum-500/10'
                  )}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((col) => (
                    <td
                      key={String(col.key)}
                      className={clsx(
                        cellPad,
                        'text-text-primary',
                        col.align === 'center' && 'text-center',
                        col.align === 'right' && 'text-right'
                      )}
                    >
                      {col.render
                        ? col.render(row)
                        : String(row[String(col.key)] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!loading && sorted.length > 0 && (
        <div className="flex items-center justify-between text-sm text-text-secondary">
          <div className="flex items-center gap-2">
            <span>Linhas por página:</span>
            <select
              value={rowsPerPage}
              onChange={(e) => {
                setRowsPerPage(Number(e.target.value))
                setPage(1)
              }}
              className="bg-surface-dark border border-border-dark rounded px-2 py-1 text-text-primary text-xs focus:outline-none focus:border-petroleum-400"
            >
              {rowsPerPageOptions.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <span>
              {(page - 1) * rowsPerPage + 1}–{Math.min(page * rowsPerPage, sorted.length)} de{' '}
              {sorted.length}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="p-1.5 rounded hover:bg-surface-dark disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              let pageNum = i + 1
              if (totalPages > 5) {
                if (page <= 3) pageNum = i + 1
                else if (page >= totalPages - 2) pageNum = totalPages - 4 + i
                else pageNum = page - 2 + i
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={clsx(
                    'w-8 h-8 rounded text-xs font-medium transition-colors',
                    page === pageNum
                      ? 'bg-petroleum-500 text-white'
                      : 'hover:bg-surface-dark text-text-secondary'
                  )}
                >
                  {pageNum}
                </button>
              )
            })}
            <button
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages}
              className="p-1.5 rounded hover:bg-surface-dark disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
