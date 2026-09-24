import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from '../layouts/AppLayout'
import NotFoundPage from '../pages/not-found'
import { appRoutes } from './config'
import { routePaths } from './paths'

const GroupLeadPage = lazy(() => import('../pages/automation/GroupLeadPage'))
const AdvisorTestPage = lazy(() => import('../pages/automation/AdvisorTestPage'))
const BulkMessagePage = lazy(() => import('../pages/automation/BulkMessagePage'))

export default function AppRouter() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to={routePaths.dashboard} replace />} />
        {appRoutes.map(({ id, path, Component }) => (
          <Route key={id} path={path} element={
            <Suspense fallback={<p className="route-loading" role="status">Đang tải trang…</p>}>
              <Component />
            </Suspense>
          } />
        ))}
        <Route path="/automation/group-lead" element={
          <Suspense fallback={<p className="route-loading" role="status">Đang tải trang…</p>}>
            <GroupLeadPage />
          </Suspense>
        } />
        <Route path="/automation/advisor-test" element={<Suspense fallback={<p>Đang tải…</p>}><AdvisorTestPage /></Suspense>} />
        <Route path="/automation/bulk-message" element={<Suspense fallback={<p className="route-loading" role="status">Đang tải trang…</p>}><BulkMessagePage /></Suspense>} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
