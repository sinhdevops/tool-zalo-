import { Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from '../layouts/AppLayout'
import NotFoundPage from '../pages/not-found'
import { appRoutes } from './config'
import { routePaths } from './paths'

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
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
