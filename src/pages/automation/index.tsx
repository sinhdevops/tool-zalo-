import { Link } from 'react-router-dom'
import { FiArrowRight, FiCheckCircle, FiHeart, FiInbox, FiUsers, FiZap } from 'react-icons/fi'
import { useChatPolling } from '../messages/hooks/useChatPolling'
import { automationApi } from './api'
import './automation.css'
import './overview.css'

export default function AutomationPage() {
  const { data, error } = useChatPolling(automationApi.state, 3000)
  const enabled = Boolean(data?.rules?.some(rule => rule.enabled) ?? data?.rule?.enabled)
  const connected = data?.connection === 'connected'
  const status = !data ? 'Đang tải' : !enabled ? 'Đang tắt' : connected ? 'Đang hoạt động' : 'Chờ kết nối'

  return (
    <div className="auto-page auto-hub">
      <header className="auto-hub__hero">
        <div>
          <span className="page-eyebrow">Trung tâm công cụ</span>
          <h1>Tự động hóa</h1>
          <p>Tất cả quy trình tự động của bạn, được tổ chức ở một nơi.</p>
        </div>
        <div className="auto-hub__summary" aria-label="Tổng quan công cụ">
          <span><strong>1</strong>Công cụ</span><i aria-hidden="true" /><span><strong>{enabled ? 1 : 0}</strong>Đang bật</span>
        </div>
      </header>

      <section className="auto-hub__metrics" aria-label="Kết quả tự động hóa">
        <div><span className="auto-hub__metric-icon blue"><FiUsers /></span><span>Lead đã lưu<strong>{data?.total ?? '—'}</strong></span></div>
        <div><span className="auto-hub__metric-icon green"><FiCheckCircle /></span><span>Đã chuyển tiếp<strong>{data?.sent ?? '—'}</strong></span></div>
        <div><span className="auto-hub__metric-icon amber"><FiZap /></span><span>Đang chờ xử lý<strong>{data?.waiting ?? '—'}</strong></span></div>
      </section>

      {(error || data?.error) && <p className="auto-error" role="alert">{data?.error || error}</p>}

      <section className="auto-hub__catalog" aria-labelledby="automation-tools-heading">
        <div className="auto-hub__section-heading">
          <div><span className="auto-hub__section-icon"><FiInbox /></span><div><h2 id="automation-tools-heading">Công cụ nhận tin</h2><p>Tự xử lý khi tài khoản nhận được tin nhắn mới.</p></div></div>
          <span className="auto-hub__count">1 công cụ</span>
        </div>

        <article className="auto-tool-card">
          <div className="auto-tool-card__identity">
            <span className="auto-tool-card__icon"><FiHeart /></span>
            <div>
              <div className="auto-tool-card__title"><h3>Trực nhóm — nhận lead</h3><span className={`auto-tool-status ${enabled && connected ? 'active' : enabled ? 'waiting' : ''}`}><i />{status}</span></div>
              <p>Phát hiện số điện thoại trong nhóm, thả tim và chuyển nguyên tin kèm danh thiếp sang nhóm nhận lead.</p>
              <div className="auto-tool-card__tags"><span>Tin nhắn nhóm</span><span>Lead</span><span>Chuyển tiếp</span></div>
            </div>
          </div>
          <div className="auto-tool-card__stats">
            <span><small>Nhóm theo dõi</small><strong>{data?.rules?.length ? `${data.rules.length} cấu hình nhận nhóm` : data?.rule?.groupName || 'Chưa cấu hình'}</strong></span>
            <span><small>Nhóm nhận</small><strong>{data?.rules?.length ? `${data.rules.filter(rule => rule.enabled).length} đang bật` : data?.rule?.targetGroupName || 'Chưa cấu hình'}</strong></span>
          </div>
          <div className="auto-tool-card__actions">
            <Link className="auto-tool-card__secondary" to="/leads">Xem lead</Link>
            <Link className="auto-tool-card__primary" to="/automation/group-lead">Mở công cụ <FiArrowRight /></Link>
          </div>
        </article>
      </section>
    </div>
  )
}
