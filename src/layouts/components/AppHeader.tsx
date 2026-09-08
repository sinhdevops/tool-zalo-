import { Link } from 'react-router-dom'
import { FiChevronsLeft, FiChevronsRight, FiMenu, FiMessageSquare, FiSettings, FiX } from 'react-icons/fi'
import { routePaths } from '../../routes/paths'
import HeaderSearch from './HeaderSearch'

interface AppHeaderProps {
  title: string
  pathname: string
  collapsed: boolean
  mobileOpen: boolean
  onToggleSidebar: () => void
  onToggleMobile: () => void
}

export default function AppHeader({ title, pathname, collapsed, mobileOpen, onToggleSidebar, onToggleMobile }: AppHeaderProps) {
  return (
    <header className="app-topbar">
      <Link to={routePaths.dashboard} className="app-brand" aria-label="Zalo Tool — Tổng quan">
        <span className="app-brand__icon"><FiMessageSquare aria-hidden="true" /></span>
        <span className="app-brand__name">zalo<span>tool</span><small>WORKSPACE</small></span>
      </Link>
      <div className="app-topbar__content">
        <button type="button" className="app-icon-button sidebar-toggle" aria-controls="app-navigation"
          aria-expanded={!collapsed} aria-label={collapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'}
          title={collapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'} onClick={onToggleSidebar}>
          {collapsed ? <FiChevronsRight aria-hidden="true" /> : <FiChevronsLeft aria-hidden="true" />}
        </button>
        <button type="button" className="app-icon-button app-menu-toggle" aria-controls="app-navigation"
          aria-expanded={mobileOpen} aria-label={mobileOpen ? 'Đóng menu' : 'Mở menu'} onClick={onToggleMobile}>
          {mobileOpen ? <FiX aria-hidden="true" /> : <FiMenu aria-hidden="true" />}
        </button>
        <span className="app-topbar__title">{title}</span>
        <HeaderSearch key={pathname} />
        <div className="app-topbar__actions">
          <Link to={routePaths.settings} className="app-icon-button" aria-label="Cài đặt ứng dụng" title="Cài đặt ứng dụng"><FiSettings aria-hidden="true" /></Link>
          <span className="app-workspace-avatar" title="Zalo Tool Workspace">ZT</span>
        </div>
      </div>
    </header>
  )
}
