import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  FiActivity, FiArrowRight, FiArrowUpRight, FiCalendar, FiCheckCircle,
  FiGrid, FiLayers, FiLink, FiMessageSquare, FiPlus, FiUsers,
} from 'react-icons/fi'
import { Dropdown } from '../../components/common'
import { routeConfig } from '../../routes/config'
import { routePaths } from '../../routes/paths'
import MetricCard from './components/MetricCard'
import './dashboard.css'

const periodOptions = [
  { value: 'week', label: '7 ngày qua' },
  { value: 'month', label: '30 ngày qua' },
] as const
type Period = (typeof periodOptions)[number]['value']

const steps = [
  { number: '01', title: 'Kết nối tài khoản Zalo', description: 'Bắt đầu từ tài khoản bạn muốn quản lý.', to: routePaths.accounts },
  { number: '02', title: 'Quản lý danh bạ', description: 'Tập trung bạn bè và các nhóm liên hệ.', to: routePaths.friends },
  { number: '03', title: 'Theo dõi hội thoại', description: 'Quản lý tin nhắn tại một không gian.', to: routePaths.messages },
] as const

export default function DashboardPage() {
  const [period, setPeriod] = useState<Period>('week')
  const periodLabel = periodOptions.find((option) => option.value === period)?.label
  const today = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date())

  return (
    <div className="dashboard">
      <header className="dashboard-heading">
        <div>
          <div className="dashboard-breadcrumb">Không gian làm việc <span>/</span> Tổng quan</div>
          <h1>Tổng quan</h1>
          <p>Chào mừng trở lại. Cùng quản lý các kết nối của bạn.</p>
        </div>
        <span className="dashboard-date"><FiCalendar aria-hidden="true" />{today}</span>
      </header>

      <section className="dashboard-banner">
        <div className="dashboard-banner__copy">
          <span className="dashboard-banner__eyebrow"><span /> KHÔNG GIAN CỦA BẠN</span>
          <h2>Kết nối Zalo. Quản lý dễ dàng hơn.</h2>
          <p>Tài khoản, tin nhắn và danh bạ — tất cả trong một không gian.</p>
        </div>
        <Link to={routePaths.accounts} className="dashboard-banner__action">
          <FiPlus aria-hidden="true" /> Quản lý tài khoản <FiArrowRight aria-hidden="true" />
        </Link>
        <div className="dashboard-banner__rings" aria-hidden="true" />
      </section>

      <section className="dashboard-metrics" aria-label="Chỉ số tổng quan">
        <MetricCard label="Tài khoản Zalo" icon={FiUsers} color="blue" to={routePaths.accounts} />
        <MetricCard label="Tin nhắn" icon={FiMessageSquare} color="violet" to={routePaths.messages} />
        <MetricCard label="Bạn bè" icon={FiUsers} color="green" to={routePaths.friends} />
        <MetricCard label="Nhóm tham gia" icon={FiLayers} color="orange" to={routePaths.groups} />
      </section>

      <div className="dashboard-columns">
        <section className="dashboard-panel activity-panel" aria-labelledby="activity-heading">
          <div className="dashboard-panel__heading">
            <div><h2 id="activity-heading">Hoạt động tin nhắn</h2><p>Tổng hợp hoạt động theo thời gian</p></div>
            <Dropdown<Period> aria-label="Khoảng thời gian hoạt động" value={period} onChange={setPeriod}
              options={periodOptions} wrapperClassName="dashboard-period" />
          </div>
          <div className="activity-chart">
            <div className="activity-chart__grid" aria-hidden="true"><span /><span /><span /><span /></div>
            <div className="dashboard-empty">
              <span className="dashboard-empty__icon"><FiActivity aria-hidden="true" /></span>
              <h3>Chưa có dữ liệu hoạt động</h3>
              <p>Kết nối tài khoản để theo dõi tin nhắn của bạn.</p>
              <Link to={routePaths.accounts}>Đi tới tài khoản <FiArrowRight aria-hidden="true" /></Link>
            </div>
          </div>
          <div className="activity-panel__footer"><span><i />Tin nhắn</span><span>{periodLabel} · Chưa đồng bộ</span></div>
        </section>

        <section className="dashboard-panel getting-started" aria-labelledby="getting-started-heading">
          <div className="dashboard-panel__heading">
            <div><h2 id="getting-started-heading">Bắt đầu với Zalo Tool</h2><p>Thiết lập không gian làm việc của bạn</p></div>
            <FiCheckCircle className="panel-heading-icon" aria-hidden="true" />
          </div>
          <ol className="dashboard-steps">
            {steps.map(({ number, title, description, to }) => (
              <li key={number}>
                <Link to={to}>
                  <span className="dashboard-steps__number">{number}</span>
                  <span><strong>{title}</strong><small>{description}</small></span>
                  <FiArrowUpRight aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ol>
          <p className="dashboard-setup-note">Các chức năng kết nối đang được xây dựng.</p>
        </section>

        <section className="dashboard-panel accounts-panel" aria-labelledby="accounts-heading">
          <div className="dashboard-panel__heading">
            <div><h2 id="accounts-heading">Tài khoản của bạn</h2><p>Theo dõi các tài khoản tại một nơi</p></div>
            <Link to={routePaths.accounts} className="dashboard-text-link">Xem tất cả <FiArrowRight aria-hidden="true" /></Link>
          </div>
          <div className="account-empty">
            <span className="dashboard-empty__icon"><FiGrid aria-hidden="true" /></span>
            <div><h3>Chưa có dữ liệu tài khoản</h3><p>Tài khoản sẽ xuất hiện tại đây sau khi kết nối.</p></div>
            <Link to={routePaths.accounts} className="account-empty__action" aria-label="Mở quản lý tài khoản"><FiPlus aria-hidden="true" /></Link>
          </div>
        </section>

        <section className="dashboard-panel shortcuts-panel" aria-labelledby="shortcuts-heading">
          <div className="dashboard-panel__heading"><div><h2 id="shortcuts-heading">Truy cập nhanh</h2><p>Các công cụ thường dùng</p></div><FiLink className="panel-heading-icon" aria-hidden="true" /></div>
          <div className="dashboard-shortcuts">
            {(['messages', 'groups', 'reminders', 'automation'] as const).map((id) => {
              const { path, title, icon: Icon } = routeConfig[id]
              return <Link key={id} to={path}><Icon aria-hidden="true" /><span>{title}</span><FiArrowUpRight aria-hidden="true" /></Link>
            })}
          </div>
        </section>
      </div>
      <footer className="dashboard-footer"><span className="status-dot" />Chưa kết nối dữ liệu Zalo<span className="dashboard-footer__end">Zalo Tool Workspace</span></footer>
    </div>
  )
}

