import type { AutomationRule } from '../../../shared/automation'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FiArrowLeft, FiArrowRight, FiCheckCircle, FiHeart, FiPlus, FiUsers, FiZap } from 'react-icons/fi'
import { useAccounts } from '../accounts/hooks/useAccounts'
import { useChatPolling } from '../messages/hooks/useChatPolling'
import { automationApi } from './api'
import RuleForm from './RuleForm'
import './automation.css'
import './overview.css'

export default function GroupLeadPage() {
  const { accounts, error: accountError } = useAccounts()
  const { data, error, refresh } = useChatPolling(automationApi.state, 3000)
  const [editing, setEditing] = useState<AutomationRule | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const rules = data?.rules ?? (data?.rule ? [{ ...data.rule, connection: data.connection }] : [])
  const enabled = rules.some(rule => rule.enabled)
  const connected = data?.connection === 'connected'
  const status = !data ? 'Đang tải' : !enabled ? 'Đang tắt' : connected ? 'Đang hoạt động' : 'Chờ kết nối'

  async function toggle(rule: AutomationRule) {
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
          <div><div className="auto-detail-hero__title"><h1>Trực nhóm — nhận lead</h1><span className={`auto-tool-status ${enabled && connected ? 'active' : enabled ? 'waiting' : ''}`}><i />{status}</span></div><p>Tự động nhận diện khách hàng từ tin nhắn nhóm và chuyển dữ liệu đến đúng nơi xử lý.</p></div>
        </div>
        <div className="auto-detail-hero__actions">
          <Link className="auto-button" to="/automation"><FiArrowLeft /> Tất cả công cụ</Link>
          <button className="auto-button primary" disabled={!data || busy || Boolean(error)} onClick={() => setEditing(null)}><FiPlus /> Tạo nhận nhóm mới</button>
        </div>
      </header>

      {(error || accountError || actionError || data?.error) && <p className="auto-error" role="alert">{actionError || data?.error || error || accountError}</p>}

      <section className="auto-detail-metrics" aria-label="Kết quả của công cụ">
        <div><FiUsers /><span>Lead đã lưu<strong>{data?.total ?? '—'}</strong></span></div>
        <div><FiCheckCircle /><span>Đã chuyển tiếp<strong>{data?.sent ?? '—'}</strong></span></div>
        <div><FiZap /><span>Đang chờ xử lý<strong>{data?.waiting ?? '—'}</strong></span></div>
      </section>

      <section className="auto-rule-section" aria-label="Danh sách nhận nhóm">
        <div className="auto-rule-section__heading"><h2>Nhận số từ các nhóm</h2><span>{rules.length} cấu hình · {rules.filter(rule => rule.enabled).length} đang bật</span></div>
        {!data && !error && <p>Đang tải cấu hình nhận nhóm…</p>}
        {data && !rules.length && <div className="auto-detail-card"><h2>Chưa có cấu hình nhận nhóm</h2><p>Bấm “Tạo nhận nhóm mới” để chọn nhóm theo dõi, người gửi và nhóm nhận số.</p></div>}
        <div className="auto-rules-grid">{rules.map(rule => <article className="auto-detail-card" key={rule.id}>
          <div className="auto-detail-card__heading"><div><span><FiUsers /></span><h2>{rule.groupName}</h2></div><span className={`auto-tool-status ${rule.enabled ? rule.connection === 'connected' ? 'active' : 'waiting' : ''}`}><i />{!rule.enabled ? 'Đang tắt' : rule.connection === 'connected' ? 'Đang hoạt động' : 'Chờ kết nối'}</span></div>
          <dl className="auto-detail-config">
            <div><dt>Tài khoản vận hành</dt><dd>{accounts.find(account => account.id === rule.accountId)?.displayName || rule.accountId}</dd></div>
            <div><dt>Nhóm theo dõi</dt><dd>{rule.groupName}</dd></div>
            <div><dt>Người gửi cần nhận</dt><dd>{rule.senderName}</dd></div>
            <div><dt>Nhóm nhận số</dt><dd>{rule.targetGroupName}</dd></div>
          </dl>
          <div className="auto-rule-actions"><button className="auto-button" disabled={busy || rule.enabled} title={rule.enabled ? 'Tắt nhận nhóm trước khi chỉnh sửa' : undefined} onClick={() => setEditing(rule)}>Chỉnh sửa</button><button className={`auto-button ${rule.enabled ? 'danger' : 'primary'}`} disabled={busy || Boolean(error)} onClick={() => void toggle(rule)}>{rule.enabled ? 'Tắt nhận nhóm' : 'Bật nhận nhóm'}</button></div>
        </article>)}</div>
      </section>
      <div className="auto-rule-process">
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
      {editing !== undefined && <RuleForm rule={editing} accounts={accounts} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); refresh() }} />}
    </div>
  )
}
