import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  ScatterChart,
  Star,
  TrendingUp,
  BarChart2,
  Settings,
  Sun,
  Moon,
  Menu,
  X,
} from 'lucide-react'
import clsx from 'clsx'
import { useState } from 'react'
import { useAppContext } from '../context/AppContext'

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/competitors', icon: Users, label: 'Concorrentes' },
  { to: '/matrix', icon: ScatterChart, label: 'Quadrante Preço×Volume' },
  { to: '/top-products', icon: Star, label: 'Top 20 Produtos' },
  { to: '/revenue', icon: TrendingUp, label: 'Faturamento' },
  { to: '/trends', icon: BarChart2, label: 'Tendências' },
]

export default function Sidebar() {
  const { theme, toggleTheme } = useAppContext()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-border-dark">
        {!collapsed && (
          <div className="flex flex-col leading-none">
            <span className="text-xl font-black tracking-tight text-white">
              TORK{' '}
              <span style={{ color: '#FF6B35' }}>VISION</span>
            </span>
            <span className="text-[9px] font-medium text-text-secondary uppercase tracking-widest mt-0.5">
              Inteligência Competitiva
            </span>
          </div>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-petroleum-500/10 transition-colors hidden lg:block"
          aria-label="Colapsar sidebar"
        >
          <Menu className="w-4 h-4" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 group relative',
                isActive
                  ? 'bg-petroleum-500/20 text-text-primary border-l-2 border-orange-accent pl-[10px]'
                  : 'text-text-secondary hover:text-text-primary hover:bg-petroleum-500/10'
              )
            }
            title={collapsed ? label : undefined}
          >
            <Icon className="w-4.5 h-4.5 flex-shrink-0 w-[18px] h-[18px]" />
            {!collapsed && (
              <span className="text-sm font-medium truncate">{label}</span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom actions */}
      <div className="px-2 py-4 border-t border-border-dark space-y-1">
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-text-secondary hover:text-text-primary hover:bg-petroleum-500/10 transition-colors"
          title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
        >
          {theme === 'dark' ? (
            <Sun className="w-[18px] h-[18px] flex-shrink-0" />
          ) : (
            <Moon className="w-[18px] h-[18px] flex-shrink-0" />
          )}
          {!collapsed && (
            <span className="text-sm font-medium">
              {theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}
            </span>
          )}
        </button>
        <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-text-secondary hover:text-text-primary hover:bg-petroleum-500/10 transition-colors">
          <Settings className="w-[18px] h-[18px] flex-shrink-0" />
          {!collapsed && <span className="text-sm font-medium">Configurações</span>}
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-surface-dark border border-border-dark text-text-primary"
        onClick={() => setMobileOpen(true)}
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={clsx(
          'lg:hidden fixed top-0 left-0 z-50 h-full w-64 bg-surface-dark border-r border-border-dark transition-transform duration-300',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <button
          className="absolute top-4 right-4 p-1.5 rounded text-text-secondary hover:text-text-primary"
          onClick={() => setMobileOpen(false)}
        >
          <X className="w-5 h-5" />
        </button>
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={clsx(
          'hidden lg:flex flex-col h-screen sticky top-0 bg-surface-dark border-r border-border-dark transition-all duration-300 flex-shrink-0',
          collapsed ? 'w-16' : 'w-64'
        )}
      >
        {sidebarContent}
      </aside>
    </>
  )
}
