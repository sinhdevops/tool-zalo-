import type { IconType } from 'react-icons'
import { Link } from 'react-router-dom'
import { FiArrowUpRight } from 'react-icons/fi'
import type { AppPath } from '../../../routes/paths'

interface MetricCardProps {
  label: string
  icon: IconType
  color: 'blue' | 'violet' | 'green' | 'orange'
  to: AppPath
}

export default function MetricCard({ label, icon: Icon, color, to }: MetricCardProps) {
  return (
    <Link className="metric-card" to={to} aria-label={`Xem ${label.toLowerCase()}`}>
      <div className="metric-card__top">
        <span className={`metric-icon metric-icon--${color}`}><Icon aria-hidden="true" /></span>
        <FiArrowUpRight className="metric-card__arrow" aria-hidden="true" />
      </div>
      <span className="metric-card__label">{label}</span>
      <strong className="metric-card__value" aria-label="Chưa có dữ liệu">—</strong>
      <span className="metric-card__foot"><span className="status-dot" /> Chờ kết nối tài khoản</span>
    </Link>
  )
}
