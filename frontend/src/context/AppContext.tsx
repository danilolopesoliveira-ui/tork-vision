import React, { createContext, useContext, useEffect, useState } from 'react'
import type { Seller, Theme, Period } from '../types'

interface AppContextValue {
  selectedSellerId: string | null
  setSelectedSellerId: (id: string | null) => void
  sellers: Seller[]
  setSellers: (sellers: Seller[]) => void
  theme: Theme
  toggleTheme: () => void
  activePeriod: Period
  setActivePeriod: (p: Period) => void
  showURLModal: boolean
  setShowURLModal: (v: boolean) => void
}

const AppContext = createContext<AppContextValue | undefined>(undefined)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null)
  const [sellers, setSellers] = useState<Seller[]>([])
  const [activePeriod, setActivePeriod] = useState<Period>('30d')
  const [showURLModal, setShowURLModal] = useState(false)

  // Theme — persisted in localStorage, default dark
  const getInitialTheme = (): Theme => {
    const stored = localStorage.getItem('tork-theme')
    if (stored === 'light' || stored === 'dark') return stored
    return 'dark'
  }
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    localStorage.setItem('tork-theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

  return (
    <AppContext.Provider
      value={{
        selectedSellerId,
        setSelectedSellerId,
        sellers,
        setSellers,
        theme,
        toggleTheme,
        activePeriod,
        setActivePeriod,
        showURLModal,
        setShowURLModal,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppContext must be used within AppProvider')
  return ctx
}
