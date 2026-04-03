import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
} from 'recharts'
import type { MatrixPoint } from '../types'

const CATEGORY_COLORS: Record<string, string> = {
  'Eletrônicos': '#5B8DB8',
  'Casa': '#00D4AA',
  'Moda': '#FF6B35',
  'Beleza': '#A855F7',
  'Esporte': '#FFB800',
  'Brinquedos': '#06B6D4',
  'Livros': '#84CC16',
  'Alimentos': '#F97316',
}
const DEFAULT_COLOR = '#8AA8C0'

function getCategoryColor(category: string) {
  return CATEGORY_COLORS[category] || DEFAULT_COLOR
}

interface Props {
  data: MatrixPoint[]
  onPointClick?: (point: MatrixPoint) => void
  highlightSeller?: string
}

function median(arr: number[]): number {
  if (!arr.length) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export default function QuadrantChart({ data, onPointClick, highlightSeller }: Props) {
  const prices = data.map((d) => d.price)
  const volumes = data.map((d) => d.volume)
  const medPrice = median(prices)
  const medVolume = median(volumes)

  const categories = [...new Set(data.map((d) => d.category))]

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null
    const point: MatrixPoint = payload[0].payload
    return (
      <div className="bg-surface-dark border border-border-dark rounded-lg p-3 shadow-card text-xs max-w-[220px]">
        <p className="font-semibold text-text-primary mb-1.5 leading-snug line-clamp-2">
          {point.title}
        </p>
        <div className="space-y-1 text-text-secondary">
          <div className="flex justify-between gap-4">
            <span>Vendedor:</span>
            <span className="text-text-primary font-medium">{point.seller_name}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span>Preço:</span>
            <span className="text-text-primary font-medium">
              {point.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span>Volume/mês:</span>
            <span className="text-text-primary font-medium">
              {point.volume.toLocaleString('pt-BR')}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span>Avaliação:</span>
            <span className="text-text-primary font-medium">⭐ {point.rating.toFixed(1)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span>Categoria:</span>
            <span className="text-text-primary font-medium">{point.category}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative">
      {/* Quadrant labels */}
      <div className="absolute inset-0 pointer-events-none z-10" style={{ paddingLeft: 80, paddingBottom: 30, paddingRight: 10 }}>
        <div className="relative w-full h-full">
          <div className="absolute top-2 right-4 text-xs font-semibold text-purple-400/50 uppercase tracking-widest">
            Stars Premium
          </div>
          <div className="absolute top-2 left-8 text-xs font-semibold text-blue-400/50 uppercase tracking-widest">
            Volume Leaders
          </div>
          <div className="absolute bottom-8 left-8 text-xs font-semibold text-gray-500/50 uppercase tracking-widest">
            Commodities
          </div>
          <div className="absolute bottom-8 right-4 text-xs font-semibold text-orange-accent/40 uppercase tracking-widest">
            Nicho / Estagnado
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={480}>
        <ScatterChart margin={{ top: 20, right: 20, bottom: 30, left: 80 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1E3A5F" strokeOpacity={0.5} />
          <XAxis
            type="number"
            dataKey="price"
            name="Preço"
            tickFormatter={(v) => `R$ ${v.toLocaleString('pt-BR')}`}
            tick={{ fill: '#8AA8C0', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: '#1E3A5F' }}
            label={{ value: 'Preço Médio (R$)', position: 'insideBottom', offset: -10, fill: '#8AA8C0', fontSize: 12 }}
          />
          <YAxis
            type="number"
            dataKey="volume"
            name="Volume"
            tickFormatter={(v) => v.toLocaleString('pt-BR')}
            tick={{ fill: '#8AA8C0', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            label={{ value: 'Volume Mensal Est.', angle: -90, position: 'insideLeft', offset: 10, fill: '#8AA8C0', fontSize: 12 }}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine
            x={medPrice}
            stroke="#1E3A5F"
            strokeDasharray="6 3"
            strokeWidth={1.5}
            label={{ value: `Mediana R$ ${medPrice.toLocaleString('pt-BR')}`, fill: '#8AA8C0', fontSize: 10, position: 'top' }}
          />
          <ReferenceLine
            y={medVolume}
            stroke="#1E3A5F"
            strokeDasharray="6 3"
            strokeWidth={1.5}
            label={{ value: `Med. ${medVolume.toLocaleString('pt-BR')} un/mês`, fill: '#8AA8C0', fontSize: 10 }}
          />
          <Scatter
            data={data}
            onClick={(p) => onPointClick?.(p as MatrixPoint)}
            style={{ cursor: onPointClick ? 'pointer' : 'default' }}
          >
            {data.map((entry, index) => (
              <Cell
                key={index}
                fill={getCategoryColor(entry.category)}
                fillOpacity={
                  highlightSeller
                    ? entry.seller_name === highlightSeller
                      ? 0.9
                      : 0.2
                    : 0.75
                }
                stroke={
                  highlightSeller && entry.seller_name === highlightSeller
                    ? '#fff'
                    : 'transparent'
                }
                strokeWidth={1}
                r={Math.max(4, Math.min(12, Math.sqrt(entry.rating) * 4))}
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-3 px-4">
        {categories.map((cat) => (
          <div key={cat} className="flex items-center gap-1.5">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: getCategoryColor(cat) }}
            />
            <span className="text-xs text-text-secondary">{cat}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 ml-4 text-xs text-text-secondary italic">
          Tamanho do ponto = avaliação
        </div>
      </div>
    </div>
  )
}
