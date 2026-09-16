import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FiArrowLeft, FiArrowRight, FiCheckCircle, FiHeart, FiSettings, FiUsers, FiZap } from 'react-icons/fi'
import { useAccounts } from '../accounts/hooks/useAccounts'
import { useChatPolling } from '../messages/hooks/useChatPolling'
import { automationApi } from './api'
import RuleForm from './RuleForm'
import './automation.css'
import './overview.css'

export default function GroupLeadPage() {
  const { accounts, error: accountError } = useAccounts()
  const { data, error, refresh } = useChatPolling(automationApi.state, 3000)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const rule = data?.rule
  const connected = data?.connection === 'connected'
  const status = !data ? 'Đang tải' : !rule?.enabled ? 'Đang tắt' : connected ? 'Đang hoạt động' : 'Chờ kết nối'

  async function toggle() {
    setBusy(true); setActionError('')
    try { await automationApi.toggle(!rule?.enabled); refresh() }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Không đổi được trạng thái.'); refresh() }
    finally { setBusy(false) }
  }

  return (
    <div className="auto-page auto-detail-page">
      <nav className="auto-breadcrumb" aria-label="Đường dẫn trang"><Link to="/automation">Tự động hóa</Link><span>/</span><span>Trực nhóm — nhận lead</span></nav>

      <header className="auto-detail-hero">
        <div className="auto-detail-hero__main">
          <span className="auto-tool-card__icon"><FiHeart /></span>
          <div><div className="auto-detail-hero__title"><h1>Trực nhóm — nhận lead</h1><span className={`auto-tool-status ${rule?.enabled && connected ? 'active' : rule?.enabled ? 'waiting' : ''}`}><i />{status}</span></div><p>Tự động nhận diện khách hàng từ tin nhắn nhóm và chuyển dữ liệu đến đúng nơi xử lý.</p></div>
        </div>
        <div className="auto-detail-hero__actions">
          <Link className="auto-button" to="/automation"><FiArrowLeft /> Tất cả công cụ</Link>
          <button className="auto-button" disabled={!data || busy || rule?.enabled} onClick={() => setEditing(true)}><FiSettings /> Cấu hình</button>
          <button className={`auto-button ${rule?.enabled ? 'danger' : 'primary'}`} disabled={!rule || busy || Boolean(error)} onClick={() => void toggle()}>{busy ? 'Đang cập nhật…' : rule?.enabled ? 'Tắt công cụ' : 'Bật công cụ'}</button>
        </div>
      </header>

      {(error || accountError || actionError || data?.error) && <p className="auto-error" role="alert">{actionError || data?.error || error || accountError}</p>}

      <section className="auto-detail-metrics" aria-label="Kết quả của công cụ">
        <div><FiUsers /><span>Lead đã lưu<strong>{data?.total ?? '—'}</strong></span></div>
        <div><FiCheckCircle /><span>Đã chuyển tiếp<strong>{data?.sent ?? '—'}</strong></span></div>
        <div><FiZap /><span>Đang chờ xử lý<strong>{data?.waiting ?? '—'}</strong></span></div>
      </section>

      <div className="auto-detail-grid">
        <section className="auto-detail-card">
          <div className="auto-detail-card__heading"><div><span>01</span><h2>Thiết lập hiện tại</h2></div><button type="button" onClick={() => setEditing(true)} disabled={!data || busy || rule?.enabled}>Chỉnh sửa</button></div>
          <dl className="auto-detail-config">
            <div><dt>Tài khoản vận hành</dt><dd>{accounts.find((account) => account.id === rule?.accountId)?.displayName || rule?.accountId || 'Chưa chọn tài khoản'}</dd></div>
            <div><dt>Nhóm theo dõi</dt><dd>{rule?.groupName || 'Chưa chọn nhóm'}</dd></div>
            <div><dt>Người gửi cần nhận</dt><dd>{rule?.senderName || 'Chưa chọn người gửi'}</dd></div>
            <div><dt>Nhóm nhận lead</dt><dd>{rule?.targetGroupName || 'Chưa chọn nhóm nhận'}</dd></div>
          </dl>
        </section>

        <section className="auto-detail-card">
          <div className="auto-detail-card__heading"><div><span>02</span><h2>Luồng xử lý</h2></div></div>
          <ol className="auto-process">
            <li><span>1</span><div><strong>Nhận tin có số điện thoại</strong><p>Chỉ xử lý tin mới từ đúng nhóm và người gửi đã cấu hình.</p></div></li>
            <li><span>2</span><div><strong>Chờ 10–15 giây và thả tim</strong><p>Xác nhận đã nhận dữ liệu trước khi chuyển tiếp.</p></div></li>
            <li><span>3</span><div><strong>Chuyển tin và danh thiếp</strong><p>Gửi nguyên nội dung cùng liên hệ Zalo sang nhóm nhận lead.</p></div></li>
          </ol>
        </section>
      </div>

      <section className="auto-detail-footer-card">
        <div><span className="auto-detail-footer-card__icon"><FiCheckCircle /></span><div><h2>Dữ liệu đầu ra</h2><p>Xem danh sách khách hàng, trạng thái chuyển tiếp và cập nhật tiến độ tư vấn.</p></div></div>
        <Link to="/leads">Quản lý lead <FiArrowRight /></Link>
      </section>

      <p className="auto-footnote">Công cụ chạy trên backend khi được bật, kể cả khi bạn chuyển sang trang khác. Tin trong lịch sử cũ không kích hoạt quy tắc.</p>
      {editing && <RuleForm rule={rule ?? null} accounts={accounts} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); refresh() }} />}
    </div>
  )
}
