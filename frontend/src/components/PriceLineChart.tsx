import { useState } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import clsx from 'clsx'

const SELLER_COLORS = [
  '#FF6B35',
  '#00D4AA',
  '#5B8DB8',
  '#FFB800',
  '#FF4444',
  '#A855F7',
  '#06B6D4',
  '#84CC16',
]

interface DataPoint {
  date: string
  [sellerName: string]: number | string
}

interface Props {
  data: DataPoint[]
  sellers: string[]
  height?: number
  showLegend?: boolean
  mini?: boolean
}

function formatCurrency(val: number) {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function PriceLineChart({
  data,
  sellers,
  height = 250,
  showLegend = true,
  mini = false,
}: Props) {
  const [hiddenSellers, setHiddenSellers] = useState<Set<string>>(new Set())

  const toggleSeller = (name: string) => {
    setHiddenSellers((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    let dateLabel = label
    try {
      dateLabel = format(parseISO(label), 'dd/MM/yyyy', { locale: ptBR })
    } catch {}
    return (
      <div className="bg-surface-dark border border-border-dark rounded-lg p-3 shadow-card text-xs">
        <p className="font-semibold text-text-primary mb-2">{dateLabel}</p>
        {payload.map((entry: any) => (
          <div key={entry.dataKey} className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-text-secondary">{entry.dataKey}:</span>
            <span className="font-medium text-text-primary">{formatCurrency(entry.value)}</span>
          </div>
        ))}
      </div>
    )
  }

  const tickFormatter = (val: string) => {
    try {
      return format(parseISO(val), 'dd/MM', { locale: ptBR })
    } catch {
      return val
    }
  }

  return (
    <div>
      {showLegend && !mini && (
        <div className="flex flex-wrap gap-2 mb-3">
          {sellers.map((seller, i) => (
            <button
              key={seller}
              onClick={() => toggleSeller(seller)}
              className={clsx(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all',
                hiddenSellers.has(seller)
                  ? 'border-border-dark text-text-secondary opacity-50'
                  : 'border-border-dark text-text-primary'
              )}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: SELLER_COLORS[i % SELLER_COLORS.length] }}
              />
              {seller}
            </button>
          ))}
        </div>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: mini ? 0 : 10 }}>
          {!mini && (
            <CartesianGrid strokeDasharray="3 3" stroke="#1E3A5F" strokeOpacity={0.5} />
          )}
          <XAxis
            dataKey="date"
            tickFormatter={tickFormatter}
            tick={{ fill: '#8AA8C0', fontSize: mini ? 9 : 11 }}
            tickLine={false}
            axisLine={{ stroke: '#1E3A5F' }}
            interval={mini ? 'preserveStartEnd' : 'preserveEnd'}
          />
          {!mini && (
            <YAxis
              tickFormatter={(v) => `R$ ${v.toLocaleString('pt-BR')}`}
              tick={{ fill: '#8AA8C0', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={80}
            />
          )}
          <Tooltip content={<CustomTooltip />} />
          {sellers.map((seller, i) => (
            <Line
              key={seller}
              type="monotone"
              dataKey={seller}
              stroke={SELLER_COLORS[i % SELLER_COLORS.length]}
              strokeWidth={mini ? 1.5 : 2}
              dot={false}
              activeDot={{ r: 4 }}
              hide={hiddenSellers.has(seller)}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
