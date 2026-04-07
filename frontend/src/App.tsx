import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AppProvider, useAppContext } from './context/AppContext'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import URLInputModal from './components/URLInputModal'
import Dashboard from './pages/Dashboard'
import CompetitorAnalysis from './pages/CompetitorAnalysis'
import PriceVolumeMatrix from './pages/PriceVolumeMatrix'
import TopProducts from './pages/TopProducts'
import RevenueEstimator from './pages/RevenueEstimator'
import MarketTrends from './pages/MarketTrends'
import StoreComparison from './pages/StoreComparison'
import { getSellers } from './api/endpoints'

// Error boundary component
import { Component, ErrorInfo, ReactNode } from 'react'

class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: any) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center">
              <p className="text-danger text-lg font-semibold mb-2">Algo deu errado</p>
              <p className="text-text-secondary text-sm mb-4">{this.state.error?.message}</p>
              <button
                onClick={() => this.setState({ hasError: false })}
                className="px-4 py-2 bg-petroleum-500 text-white rounded-xl text-sm"
              >
                Tentar novamente
              </button>
            </div>
          </div>
        )
      )
    }
    return this.props.children
  }
}

function AppInner() {
  const { selectedSellerId, setSelectedSellerId, setSellers, showURLModal, setShowURLModal } =
    useAppContext()
  const autoSelectedRef = useRef(false)

  const { data: sellers } = useQuery({
    queryKey: ['sellers'],
    queryFn: getSellers,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  // Auto-select first seller and populate sellers list
  useEffect(() => {
    if (!sellers || sellers.length === 0) return
    setSellers(sellers)
    // Auto-select TechStore or first seller
    if (!selectedSellerId && !autoSelectedRef.current) {
      autoSelectedRef.current = true
      const techStore = sellers.find(
        (s) => s.seller_id === 'techstore_ml' || s.seller_name.toLowerCase().includes('tech')
      )
      setSelectedSellerId((techStore || sellers[0]).seller_id)
    }
  }, [sellers, selectedSellerId, setSellers, setSelectedSellerId])

  return (
    <div className="flex min-h-screen bg-surface-darker">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 overflow-auto">
          <Routes>
            <Route
              path="/"
              element={
                <ErrorBoundary>
                  <Dashboard />
                </ErrorBoundary>
              }
            />
            <Route
              path="/competitors"
              element={
                <ErrorBoundary>
                  <CompetitorAnalysis />
                </ErrorBoundary>
              }
            />
            <Route
              path="/matrix"
              element={
                <ErrorBoundary>
                  <PriceVolumeMatrix />
                </ErrorBoundary>
              }
            />
            <Route
              path="/top-products"
              element={
                <ErrorBoundary>
                  <TopProducts />
                </ErrorBoundary>
              }
            />
            <Route
              path="/revenue"
              element={
                <ErrorBoundary>
                  <RevenueEstimator />
                </ErrorBoundary>
              }
            />
            <Route
              path="/trends"
              element={
                <ErrorBoundary>
                  <MarketTrends />
                </ErrorBoundary>
              }
            />
            <Route
              path="/compare"
              element={
                <ErrorBoundary>
                  <StoreComparison />
                </ErrorBoundary>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>

      {/* URL Input Modal */}
      {showURLModal && <URLInputModal onClose={() => setShowURLModal(false)} />}
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  )
}
