import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { appRoutes } from '../routes/config'
import AppHeader from './components/AppHeader'
import AppSidebar from './components/AppSidebar'
import './AppLayout.css'

export default function AppLayout() {
  const { pathname } = useLocation()
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('zalo-tool:sidebar-collapsed') === 'true' }
    catch { return false }
  })
  const [menuPath, setMenuPath] = useState<string | null>(null)
  const menuOpen = menuPath === pathname
  const currentRoute = appRoutes.find((route) => route.path === pathname.replace(/\/$/, ''))
  const title = currentRoute?.title ?? 'Không tìm thấy trang'

  useEffect(() => {
    try { localStorage.setItem('zalo-tool:sidebar-collapsed', String(collapsed)) }
    catch { /* Keep the toggle usable when browser storage is unavailable. */ }
  }, [collapsed])

  useEffect(() => {
    document.title = `${title} | Zalo Tool`
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname, title])

  return (
    <div className="app-shell" data-collapsed={collapsed}>
      <a className="skip-link" href="#page-content">Đi tới nội dung</a>
      <AppHeader title={title} pathname={pathname} collapsed={collapsed} mobileOpen={menuOpen}
        onToggleSidebar={() => setCollapsed((value) => !value)}
        onToggleMobile={() => setMenuPath(menuOpen ? null : pathname)} />
      <AppSidebar collapsed={collapsed} mobileOpen={menuOpen} onNavigate={() => setMenuPath(null)} />
      <main className="app-content" id="page-content" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  )
}
