import { NavLink } from 'react-router-dom'
import { appRoutes, navigationGroups } from '../../routes/config'

interface AppSidebarProps {
  collapsed: boolean
  mobileOpen: boolean
  onNavigate: () => void
}

export default function AppSidebar({ collapsed, mobileOpen, onNavigate }: AppSidebarProps) {
  return (
    <aside className="app-sidebar" data-open={mobileOpen} id="app-navigation">
      <nav aria-label="Điều hướng chính">
        {navigationGroups.map((group) => (
          <div className="app-nav-group" key={group}>
            <p className="app-nav-group__label">{group}</p>
            {appRoutes.filter((route) => route.group === group).map(({ id, path, title, icon: Icon }) => (
              <NavLink key={id} to={path} end={id !== 'automation'} onClick={onNavigate} aria-label={title}
                title={collapsed ? title : undefined}
                className={({ isActive }) => `app-nav-link${isActive ? ' app-nav-link--active' : ''}`}>
                <Icon aria-hidden="true" /><span className="app-nav-link__label">{title}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  )
}
