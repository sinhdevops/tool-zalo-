import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FiArrowRight, FiCheckCircle, FiHeart, FiInbox, FiSettings, FiUsers, FiZap } from 'react-icons/fi'
import { useAccounts } from '../accounts/hooks/useAccounts'
import { useChatPolling } from '../messages/hooks/useChatPolling'
import { automationApi } from './api'
import RuleForm from './RuleForm'
import './automation.css'
export default function AutomationPage() {
  const { accounts, error: accountError } = useAccounts()
  const { data, error, refresh } = useChatPolling(automationApi.state, 3000)
  const [editing, setEditing] = useState(false), [busy, setBusy] = useState(false), [actionError, setActionError] = useState('')
  const rule = data?.rule, connected = data?.connection === 'connected'
  async function toggle() {
    setBusy(true); setActionError('')
    try { await automationApi.toggle(!rule?.enabled); refresh() }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Không đổi được trạng thái.'); refresh() }
    finally { setBusy(false) }
  }
  return <div className="auto-page">
    <header className="page-heading"><span className="page-eyebrow">Công cụ</span><h1>Tự động hóa</h1><p>Quản lý các công cụ tự động theo từng nhóm chức năng.</p></header>
    <div className="auto-tabs" role="tablist" aria-label="Nhóm công cụ tự động hóa">
      <button id="automation-tab-inbox" type="button" role="tab" aria-selected="true" aria-controls="automation-panel-inbox"><FiInbox /> Nhận tin <span>1</span></button>
    </div>
    <section className="auto-tab-panel" id="automation-panel-inbox" role="tabpanel" aria-labelledby="automation-tab-inbox">
      <div className="auto-panel-heading"><div><h2>Nhận tin</h2><p>Các công cụ tự xử lý ngay khi tài khoản nhận được tin nhắn mới.</p></div><Link className="auto-button" to="/leads">Quản lý lead <FiArrowRight /></Link></div>
      <div className="auto-metrics"><div><FiUsers /><span>Lead đã lưu<strong>{data?.total ?? '—'}</strong></span></div><div><FiCheckCircle /><span>Đã gửi sang nhóm<strong>{data?.sent ?? '—'}</strong></span></div><div><FiZap /><span>Chưa gửi<strong>{data?.waiting ?? '—'}</strong></span></div></div>
      {(error || accountError || actionError || data?.error) && <p className="auto-error" role="alert">{actionError || data?.error || error || accountError}</p>}
      <h2 className="section-title">Công cụ nhận tin</h2><div className="automation-cards"><section className="automation-card" aria-label="Trực nhóm — nhận lead">
        <div className="auto-card-top"><span className="auto-feature-icon"><FiHeart /></span><span className={`auto-badge ${rule?.enabled && connected ? 'green' : ''}`}>{!data ? 'Đang tải…' : !rule?.enabled ? 'Đang tắt' : connected ? 'Đang trực' : 'Chờ kết nối'}</span></div>
        <h2>Trực nhóm — nhận lead</h2><p>Nhận tin có số điện thoại, thả tim rồi gửi nguyên tin và danh thiếp sang nhóm nhận.</p>
        <dl className="auto-config"><dt>Tài khoản</dt><dd>{accounts.find((a) => a.id === rule?.accountId)?.displayName || rule?.accountId || 'Chưa chọn'}</dd><dt>Nhóm theo dõi</dt><dd>{rule?.groupName || 'Trà Xinh Tv Viettel 🍀💰💸❤️'}</dd><dt>Người gửi</dt><dd>{rule?.senderName || 'Wifi Truyền Hình Camera V I E T T E L'}</dd><dt>Nhóm nhận số</dt><dd>{rule?.targetGroupName || 'Chưa chọn'}</dd></dl>
        <div className="auto-flow"><span>Nhận số</span><FiArrowRight /><span>Chờ 10–15 giây + ❤️</span><FiArrowRight /><span>Gửi tin + danh thiếp</span></div>
        <p className="auto-small">Luôn gửi đầy đủ tin nhắn chứa số. Danh thiếp được lấy từ tin nguồn hoặc tra trực tiếp bằng số Zalo rồi gửi ngay sau tin. Chỉ xử lý tin mới khi quy tắc đang bật.</p>
        {rule?.enabledAt ? <p className="auto-small">Lần bật gần nhất: {new Date(rule.enabledAt).toLocaleString('vi-VN')}</p> : null}
        <div className="auto-card-footer"><button className="auto-button" disabled={!data || busy || rule?.enabled} onClick={() => setEditing(true)}><FiSettings />Cấu hình</button><button className={`auto-button ${rule?.enabled ? 'danger' : 'primary'}`} disabled={!rule || busy || Boolean(error)} onClick={() => void toggle()}>{busy ? 'Đang cập nhật…' : rule?.enabled ? 'Tắt quy tắc' : 'Bật quy tắc'}</button></div>
      </section></div>
      <p className="auto-footnote">Backend cần chạy và tài khoản cần kết nối. Bạn có thể chuyển trang; không cần mở sẵn hội thoại. Tin trong lịch sử cũ không tự kích hoạt quy tắc. <Link to="/settings?tab=log">Xem nhật ký trong Cài đặt</Link>.</p>
    </section>
    {editing && <RuleForm rule={rule ?? null} accounts={accounts} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); refresh() }} />}
  </div>
}
