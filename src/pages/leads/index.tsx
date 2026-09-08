import { useCallback, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FiArrowLeft, FiEdit2, FiMessageCircle, FiSearch, FiUsers } from 'react-icons/fi'
import { useChatPolling } from '../messages/hooks/useChatPolling'
import { automationApi } from '../automation/api'
import { leadStageLabels, leadStatusLabels } from '../../../shared/automation'
import { Dropdown, Input, Modal, Textarea } from '../../components/common'
import type { Lead, LeadStage } from '../../../shared/automation'
import '../automation/automation.css'
const stageOptions = Object.entries(leadStageLabels).map(([value, label]) => ({ value: value as LeadStage, label }))
function EditLead({ lead, onClose, onSaved }: { lead: Lead; onClose: () => void; onSaved: (lead: Lead) => void }) {
  const [name, setName] = useState(lead.name), [phone, setPhone] = useState(lead.phone), [address, setAddress] = useState(lead.address), [plan, setPlan] = useState(lead.plan)
  const [stage, setStage] = useState<LeadStage>(lead.stage ?? 'new'), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  async function save() { setBusy(true); setError(''); try { onSaved(await automationApi.editLead(lead, { name, phone, address, plan, stage })) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không lưu được lead.') } finally { setBusy(false) } }
  return <Modal title="Chỉnh sửa lead" onClose={onClose} closeDisabled={busy}><form className="auto-form auto-edit-form" onSubmit={(e) => { e.preventDefault(); void save() }}>
    <div className="auto-edit-grid"><Input label="Tên khách hàng" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} disabled={busy} /><Input label="Số điện thoại" value={phone} inputMode="tel" required maxLength={20} onChange={(e) => setPhone(e.target.value)} disabled={busy} /><Input label="Gói cước" value={plan} maxLength={120} onChange={(e) => setPlan(e.target.value)} disabled={busy} /><Dropdown<LeadStage> label="Trạng thái khách hàng" value={stage} options={stageOptions} onChange={setStage} disabled={busy} /></div>
    <Textarea label="Địa chỉ" value={address} maxLength={500} rows={3} onChange={(e) => setAddress(e.target.value)} disabled={busy} />
    <div className="auto-note">Việc sửa số điện thoại không tự chuyển tiếp lại tin nhắn nguồn.</div>{error && <p className="auto-error" role="alert">{error}</p>}
    <div className="auto-actions"><button type="button" className="auto-button" onClick={onClose} disabled={busy}>Hủy</button><button className="auto-button primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu thay đổi'}</button></div>
  </form></Modal>
}
export default function LeadsPage() {
  const [search, setSearch] = useState(''), [stage, setStage] = useState<LeadStage | ''>(''), [page, setPage] = useState(1)
  const [params, setParams] = useSearchParams(), [selected, setSelected] = useState<Lead | null>(null)
  const [saveError, setSaveError] = useState('')
  const loader = useCallback((signal: AbortSignal) => automationApi.leads(search, stage, page, signal), [search, stage, page])
  const { data, error, refresh } = useChatPolling(loader, 3000)
  const leadId = selected?.id || params.get('lead') || ''
  const detailLoader = useCallback((signal: AbortSignal) => leadId ? automationApi.lead(leadId, signal) : Promise.resolve(null), [leadId])
  const { data: detail, error: detailError } = useChatPolling(detailLoader, 3000)
  const active = detail?.id === leadId ? detail : selected
  return <div className="auto-page">
    <header className="page-heading auto-heading"><div><span className="page-eyebrow">Không gian làm việc</span><h1>Quản lý lead</h1><p>Số điện thoại và tiến độ liên hệ được lưu từ các quy tắc trực nhóm.</p></div><Link className="auto-button" to="/automation"><FiArrowLeft />Tự động hóa</Link></header>
    <section className="auto-leads-card"><div className="auto-log-heading"><h2><FiUsers /> Danh sách lead <span className="auto-badge">{data?.total ?? '—'}</span></h2><button className="auto-button" onClick={refresh}>Làm mới</button></div>
      <div className="auto-toolbar"><label className="auto-search"><FiSearch /><input type="search" aria-label="Tìm lead" placeholder="Số điện thoại, tên khách, địa chỉ…" value={search} maxLength={200} onChange={(e) => { setSearch(e.target.value); setPage(1) }} /></label><Dropdown<LeadStage | ''> aria-label="Lọc trạng thái khách hàng" wrapperClassName="auto-stage-filter" value={stage} onChange={(value) => { setStage(value); setPage(1) }} options={[{ value: '', label: 'Tất cả trạng thái' }, ...stageOptions]} /></div>
      {error && <p className="auto-error" role="alert">{error}</p>}
      {detailError && leadId && <p className="auto-error" role="alert">{detailError}</p>}
      {saveError && <p className="auto-error auto-table-error" role="alert">{saveError}</p>}
      <div className="auto-table-scroll"><table className="auto-table"><thead><tr><th>Thời gian lưu</th><th>Khách hàng / Số điện thoại</th><th>Địa chỉ</th><th>Trạng thái</th><th>Đã gửi sang nhóm</th><th>Thao tác</th></tr></thead><tbody>
        {!data || data.leads.length === 0 ? <tr><td colSpan={6}><div className="auto-empty"><FiUsers /><strong>{!data ? 'Đang tải lead…' : search || stage ? 'Không tìm thấy lead phù hợp' : 'Chưa có lead nào'}</strong><p>Lead được lưu khi tin mới có số điện thoại.</p></div></td></tr> : data.leads.map((lead) => { const forwarded = lead.status === 'sent' && lead.delivery === 'forward'; const status = lead.status === 'sent' && !lead.delivery ? 'Đã gửi riêng (dữ liệu cũ)' : leadStatusLabels[lead.status]; return <tr key={lead.id}><td><time>{new Date(lead.createdAt).toLocaleString('vi-VN')}</time><small>{lead.groupName}</small></td><td><strong>{lead.name || 'Chưa có tên'}</strong><a href={`tel:${lead.phone}`}>{lead.phone}</a></td><td className="auto-address">{lead.address || 'Chưa có địa chỉ'}{lead.plan && <small>{lead.plan}</small>}</td><td><Dropdown<LeadStage> aria-label={`Trạng thái của ${lead.phone}`} wrapperClassName="auto-row-stage" value={lead.stage ?? 'new'} options={stageOptions} onChange={async (value) => { setSaveError(''); try { await automationApi.editLead(lead, { name: lead.name, phone: lead.phone, address: lead.address, plan: lead.plan, stage: value }); refresh() } catch (cause) { setSaveError(cause instanceof Error ? cause.message : 'Không cập nhật được trạng thái.'); refresh() } }} /></td><td><input type="checkbox" aria-label={`Đã chuyển tiếp số ${lead.phone}`} checked={forwarded} disabled title={`${status} — tự tích khi Zalo xác nhận chuyển tiếp thành công`} />{lead.status === 'sent' && lead.contactId && <Link className="auto-message-link" to={`/messages?${new URLSearchParams({ account: lead.accountId, thread: lead.contactId, name: lead.name || `Zalo ${lead.contactId}` })}`}><FiMessageCircle /> Nhắn tin</Link>}<small>{status}</small></td><td><button className="auto-button" onClick={() => setSelected(lead)}><FiEdit2 />Sửa</button></td></tr> })}
      </tbody></table></div>
      <footer className="auto-pagination"><span>{data?.total ?? 0} lead · 50 / trang</span><button className="auto-button" disabled={page === 1} onClick={() => setPage(page - 1)}>Trước</button><span>Trang {page}</span><button className="auto-button" disabled={!data || page * 50 >= data.total} onClick={() => setPage(page + 1)}>Sau</button></footer>
    </section><p className="auto-footnote">Ô “Đã gửi sang nhóm” phản ánh xác nhận từ Zalo. Trạng thái chờ hoặc cần kiểm tra luôn chưa được tích. Số trùng trong cùng nguồn được cập nhật vào lead đã có.</p>
    {active && <EditLead lead={active} onClose={() => { setSelected(null); setParams({}) }} onSaved={() => { setSelected(null); setParams({}); refresh() }} />}
  </div>
}
