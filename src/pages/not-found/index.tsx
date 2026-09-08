import { Link } from 'react-router-dom'
import { routePaths } from '../../routes/paths'

export default function NotFoundPage() {
  return (
    <div className="not-found">
      <span className="page-eyebrow">404</span>
      <h1>Không tìm thấy trang</h1>
      <p>Đường dẫn này không tồn tại. Bạn có thể quay về trang tổng quan để tiếp tục.</p>
      <Link className="app-primary-link" to={routePaths.dashboard}>Về trang tổng quan</Link>
    </div>
  )
}
