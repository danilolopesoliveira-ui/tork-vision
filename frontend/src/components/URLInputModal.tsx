import { useState, useEffect, useRef } from 'react'
import { X, Link, CheckCircle, AlertCircle, Loader2, Search, Store, Clock } from 'lucide-react'
import clsx from 'clsx'
import { startAnalysis, getJobStatus, getSellers } from '../api/endpoints'
import { useAppContext } from '../context/AppContext'
import type { JobResponse } from '../types'

const MARKETPLACE_PATTERNS: { pattern: RegExp; name: string; color: string; supported: boolean }[] = [
  { pattern: /mercadolivre\.com\.br/i, name: 'Mercado Livre', color: '#FFE600', supported: true },
  { pattern: /shopee\.com\.br/i, name: 'Shopee', color: '#EE4D2D', supported: false },
  { pattern: /amazon\.com\.br/i, name: 'Amazon', color: '#FF9900', supported: false },
  { pattern: /magazineluiza|magalu/i, name: 'Magazine Luiza', color: '#0086FF', supported: false },
  { pattern: /americanas\.com/i, name: 'Americanas', color: '#E60014', supported: false },
]

const STEPS = [
  { label: 'Detectando marketplace', icon: Search },
  { label: 'Coletando SKUs', icon: Store },
  { label: 'Identificando concorrentes', icon: Link },
  { label: 'Calculando métricas', icon: CheckCircle },
]

interface Props {
  onClose: () => void
}

export default function URLInputModal({ onClose }: Props) {
  const [url, setUrl] = useState('')
  const [detectedMarketplace, setDetectedMarketplace] = useState<{ name: string; color: string; supported: boolean } | null>(null)
  const [job, setJob] = useState<JobResponse | null>(null)
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const { setSellers, setSelectedSellerId } = useAppContext()

  useEffect(() => {
    const m = MARKETPLACE_PATTERNS.find((p) => p.pattern.test(url))
    setDetectedMarketplace(m ? { name: m.name, color: m.color, supported: m.supported } : null)
  }, [url])

  useEffect(() => {
    if (!job || job.status === 'completed' || job.status === 'failed') return

    intervalRef.current = setInterval(async () => {
      try {
        const updated = await getJobStatus(job.job_id)
        setJob(updated)

        const progress = updated.progress
        if (progress < 0.2) setStep(0)
        else if (progress < 0.5) setStep(1)
        else if (progress < 0.8) setStep(2)
        else setStep(3)

        if (updated.status === 'completed') {
          clearInterval(intervalRef.current!)
          const sellers = await getSellers()
          setSellers(sellers)
          if (updated.result?.seller_id) {
            setSelectedSellerId(updated.result.seller_id)
          }
        } else if (updated.status === 'failed') {
          clearInterval(intervalRef.current!)
          setError(updated.error || 'Análise falhou. Tente novamente.')
        }
      } catch {
        clearInterval(intervalRef.current!)
        setError('Erro ao verificar status do job.')
      }
    }, 2000)

    return () => clearInterval(intervalRef.current!)
  }, [job, setSellers, setSelectedSellerId])

  const handleSubmit = async () => {
    if (!url.trim()) return
    setError(null)
    setStep(0)
    try {
      const newJob = await startAnalysis(url.trim())
      // If already analyzed, backend returns job_id: "existing"
      if (newJob.job_id === 'existing') {
        const sellers = await getSellers()
        setSellers(sellers)
        if (newJob.result?.seller_id) setSelectedSellerId(newJob.result.seller_id)
        setJob({ ...newJob, status: 'completed', progress: 1 })
        return
      }
      setJob(newJob)
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Erro ao iniciar análise.')
    }
  }

  const isRunning = job && (job.status === 'queued' || job.status === 'running')
  const isCompleted = job?.status === 'completed'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(10,15,30,0.8)' }}
      onClick={(e) => e.target === e.currentTarget && !isRunning && onClose()}
    >
      <div className="w-full max-w-lg bg-surface-dark border border-border-dark rounded-2xl shadow-card animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border-dark">
          <div>
            <h2 className="text-lg font-bold text-text-primary">Analisar Nova Loja</h2>
            <p className="text-sm text-text-secondary mt-0.5">
              Cole a URL da loja para iniciar a análise competitiva
            </p>
          </div>
          {!isRunning && (
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-petroleum-500/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Marketplace support badges */}
          {!isRunning && !isCompleted && (
            <div>
              <p className="text-xs text-text-secondary mb-2 uppercase tracking-wide font-medium">Marketplaces</p>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-success/10 text-success border border-success/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-success"></span>
                  Mercado Livre
                </span>
                {['Shopee', 'Amazon BR', 'Magalu', 'Americanas'].map((name) => (
                  <span key={name} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-surface-darker text-text-secondary border border-border-dark">
                    <Clock className="w-3 h-3" />
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* URL Input */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-2 uppercase tracking-wide">
              URL da Loja
            </label>
            <div className="relative">
              <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary pointer-events-none" />
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={!!isRunning || isCompleted}
                placeholder="https://www.mercadolivre.com.br/loja/nome-da-loja"
                className="w-full pl-10 pr-4 py-3 bg-surface-darker border border-border-dark rounded-xl text-text-primary placeholder-text-secondary/50 text-sm focus:outline-none focus:border-petroleum-400 disabled:opacity-60 transition-colors"
                onKeyDown={(e) => e.key === 'Enter' && !isRunning && handleSubmit()}
              />
            </div>
            <p className="text-xs text-text-secondary mt-1.5 ml-1">
              Exemplo: <span className="text-petroleum-400 font-mono">https://www.mercadolivre.com.br/loja/techstore</span>
            </p>
          </div>

          {/* Marketplace detection */}
          {detectedMarketplace && !isRunning && !isCompleted && (
            <div className={clsx(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-xs border',
              detectedMarketplace.supported
                ? 'bg-success/5 border-success/20'
                : 'bg-warning/5 border-warning/20'
            )}>
              {detectedMarketplace.supported ? (
                <CheckCircle className="w-4 h-4 text-success flex-shrink-0" />
              ) : (
                <Clock className="w-4 h-4 text-warning flex-shrink-0" />
              )}
              <span className="text-text-secondary">Marketplace detectado:</span>
              <span className="font-semibold" style={{ color: detectedMarketplace.color }}>
                {detectedMarketplace.name}
              </span>
              {!detectedMarketplace.supported && (
                <span className="text-warning ml-1">— em desenvolvimento</span>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-danger/5 border border-danger/20 rounded-lg text-xs">
              <AlertCircle className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
              <span className="text-danger leading-relaxed">{error}</span>
            </div>
          )}

          {/* Progress tracker */}
          {(isRunning || isCompleted) && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-text-secondary uppercase tracking-wide">
                  {job?.step || 'Processando...'}
                </span>
                <span className="text-xs text-petroleum-400 font-semibold">
                  {Math.round((job?.progress || 0) * 100)}%
                </span>
              </div>
              <div className="w-full h-1.5 bg-border-dark rounded-full overflow-hidden">
                <div
                  className="h-full bg-petroleum-500 rounded-full transition-all duration-500"
                  style={{ width: `${(job?.progress || 0) * 100}%` }}
                />
              </div>
              <div className="space-y-2 pt-1">
                {STEPS.map((s, i) => {
                  const done = isCompleted || i < step
                  const active = !isCompleted && i === step
                  const Icon = s.icon
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <div
                        className={clsx(
                          'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0',
                          done
                            ? 'bg-success/20 text-success'
                            : active
                            ? 'bg-petroleum-500/20 text-petroleum-400'
                            : 'bg-border-dark/50 text-text-secondary/30'
                        )}
                      >
                        {active ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Icon className="w-3.5 h-3.5" />
                        )}
                      </div>
                      <span
                        className={clsx(
                          'text-sm',
                          done ? 'text-success' : active ? 'text-text-primary' : 'text-text-secondary/40'
                        )}
                      >
                        {s.label}
                        {done && !active && ' ✓'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Success state */}
          {isCompleted && job?.result && (
            <div className="p-4 bg-success/10 border border-success/20 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-5 h-5 text-success" />
                <span className="font-semibold text-success">Análise concluída!</span>
              </div>
              <p className="text-sm text-text-secondary">
                <strong className="text-text-primary">{job.result.seller_name}</strong> —{' '}
                {job.result.total_skus} SKUs analisados no{' '}
                <span className="capitalize">{job.result.marketplace}</span>
              </p>
            </div>
          )}

          {/* Already analyzed */}
          {isCompleted && job?.job_id === 'existing' && !job?.result && (
            <div className="p-4 bg-petroleum-500/10 border border-petroleum-500/20 rounded-xl">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-petroleum-400" />
                <span className="font-semibold text-petroleum-400">Loja já analisada</span>
              </div>
              <p className="text-sm text-text-secondary mt-1">Os dados desta loja já estão disponíveis no dashboard.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 pt-0">
          {!isRunning && !isCompleted && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={!url.trim()}
                className="px-6 py-2.5 bg-orange-accent hover:bg-orange-light text-white font-semibold text-sm rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Iniciar Análise
              </button>
            </>
          )}
          {isCompleted && (
            <button
              onClick={onClose}
              className="px-6 py-2.5 bg-petroleum-500 hover:bg-petroleum-600 text-white font-semibold text-sm rounded-xl transition-colors"
            >
              Ver Dashboard
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
