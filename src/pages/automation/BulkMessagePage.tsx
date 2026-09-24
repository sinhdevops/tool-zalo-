import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FiAlertCircle, FiArrowLeft, FiCheckCircle, FiClock, FiMessageSquare, FiPhone, FiPlay, FiPlus, FiRefreshCw, FiSquare } from 'react-icons/fi'
import Modal from '../../components/common/Modal'
import { useAccounts } from '../accounts/hooks/useAccounts'
import { useChatPolling } from '../messages/hooks/useChatPolling'
import { automationApi } from './api'
import './automation.css'
import './overview.css'

const statusLabels = {
  pending: 'Chờ xử lý',
  searching: 'Đang tìm Zalo',
  sending: 'Đang gửi',
  sent: 'Đã gửi',
  error: 'Lỗi',
} as const

const campaignStateLabels = {
  ready: 'Chưa chạy',
  running: 'Đang chạy',
  stopped: 'Đã dừng',
  completed: 'Hoàn tất',
} as const

export default function BulkMessagePage() {
  const { accounts, error: accountError } = useAccounts()
  const { data, error, refresh } = useChatPolling(automationApi.bulkState, 1500)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [accountId, setAccountId] = useState('')
  const [phones, setPhones] = useState('')
  const [message, setMessage] = useState('')
  const [startTime, setStartTime] = useState('07:00')
  const [endTime, setEndTime] = useState('21:00')
  const [delaySeconds, setDelaySeconds] = useState(15)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')

  const selectedAccountId = accountId || accounts[0]?.id || ''

  const progress = useMemo(() => data?.total ? Math.round(((data.sent + data.failed) / data.total) * 100) : 0, [data])
  const runningStatus = data?.running ? (data.pausedReason ? data.pausedReason : 'Đang xử lý danh sách.') : data?.pausedReason || 'Chưa chạy'

  async function createCampaign() {
    setBusy(true); setActionError('')
    try {
      await automationApi.bulkCreate({ accountId: selectedAccountId, phones, message, startTime, endTime, delaySeconds })
      setSettingsOpen(false)
      setPhones('')
      setMessage('')
      refresh()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Không tạo được cấu hình gửi tin.')
    } finally { setBusy(false) }
  }

  async function runCampaign(id: string) {
    setBusy(true); setActionError('')
    try { await automationApi.bulkStart(id); refresh() }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Không chạy được cấu hình này.') }
    finally { setBusy(false) }
  }

  async function stop() {
    setBusy(true); setActionError('')
    try { await automationApi.bulkStop(data?.activeCampaignId); refresh() }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Không dừng được lượt gửi.') }
    finally { setBusy(false) }
  }

  async function retryFailed(id = data?.activeCampaignId) {
    setBusy(true); setActionError('')
    try { await automationApi.bulkRetry(id); refresh() }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Không gửi lại được các số lỗi.') }
    finally { setBusy(false) }
  }

  return (
    <div className="auto-page auto-detail-page bulk-page">
      <nav className="auto-breadcrumb" aria-label="Đường dẫn trang"><Link to="/automation">Tự động hóa</Link><span>/</span><span>Gửi tin hàng loạt</span></nav>

      <header className="auto-detail-hero">
        <div className="auto-detail-hero__main">
          <span className="auto-tool-card__icon bulk-icon"><FiMessageSquare /></span>
          <div>
            <div className="auto-detail-hero__title"><h1>Gửi tin hàng loạt</h1><span className={`auto-tool-status ${data?.running ? 'active' : ''}`}><i />{data?.running ? 'Đang chạy' : 'Đang tắt'}</span></div>
            <p>Tìm tài khoản Zalo theo danh sách số điện thoại, gửi nội dung đã cấu hình và ghi rõ kết quả từng số.</p>
          </div>
        </div>
        <div className="auto-detail-hero__actions">
          <Link className="auto-button" to="/automation"><FiArrowLeft /> Tất cả công cụ</Link>
          {data?.running && <button className="auto-button danger" disabled={busy} onClick={() => void stop()}><FiSquare /> Dừng</button>}
          <button className="auto-button primary" disabled={busy} onClick={() => setSettingsOpen(true)}><FiPlus /> Tạo cấu hình</button>
        </div>
      </header>

      {(error || accountError || actionError) && <p className="auto-error" role="alert">{actionError || error || accountError}</p>}

      <section className="auto-detail-metrics" aria-label="Tiến độ gửi">
        <div><FiPhone /><span>Tổng số<strong>{data?.total ?? 0}</strong></span></div>
        <div><FiCheckCircle /><span>Đã gửi<strong>{data?.sent ?? 0}</strong></span></div>
        <div><FiAlertCircle /><span>Lỗi<strong>{data?.failed ?? 0}</strong></span></div>
      </section>

      <div className="auto-detail-grid bulk-summary-grid">
        <section className="auto-detail-card">
          <div className="auto-detail-card__heading"><div><span><FiClock /></span><h2>Trạng thái</h2></div></div>
          <dl className="auto-detail-config">
            <div><dt>Tiến độ</dt><dd>{progress}% · {data?.pending ?? 0} số còn lại</dd></div>
            <div><dt>Khung giờ (Việt Nam)</dt><dd>{data?.settings ? `${data.settings.startTime}–${data.settings.endTime}` : '07:00–21:00'}</dd></div>
            <div><dt>Delay mỗi lượt</dt><dd>{data?.settings?.delaySeconds ?? delaySeconds} giây</dd></div>
            <div><dt>Nghỉ định kỳ</dt><dd>Sau 2 lượt thành công · nghỉ 60 giây</dd></div>
            <div><dt>Hiện tại</dt><dd>{runningStatus}</dd></div>
            {data?.nextActionAt && <div><dt>Lượt tiếp theo</dt><dd>{new Date(data.nextActionAt).toLocaleTimeString('vi-VN')}</dd></div>}
          </dl>
        </section>

        <section className="auto-detail-card">
          <div className="auto-detail-card__heading"><div><span>01</span><h2>Luồng xử lý</h2></div></div>
          <ol className="auto-process">
            <li><span>1</span><div><strong>Đọc từng số điện thoại</strong><p>Danh sách nhập theo dạng mỗi dòng một số, tự bỏ số trùng.</p></div></li>
            <li><span>2</span><div><strong>Tìm tài khoản Zalo</strong><p>Không tìm thấy sẽ ghi lỗi cho số đó và chuyển sang số tiếp theo.</p></div></li>
            <li><span>3</span><div><strong>Gửi và chờ theo rate limit</strong><p>Ngoài khung giờ cấu hình, queue tự tạm dừng và giữ nguyên tiến độ.</p></div></li>
          </ol>
        </section>
      </div>

      <section className="auto-log bulk-campaigns">
        <div className="auto-log-heading"><h2><FiMessageSquare /> Danh sách đã tạo</h2><span className="auto-badge">{data?.campaigns?.length ?? 0} cấu hình</span></div>
        {!data?.campaigns?.length ? <div className="auto-empty"><FiMessageSquare /><strong>Chưa có cấu hình</strong><p>Bấm “Tạo cấu hình” để thêm một danh sách gửi. Tạo xong sẽ chưa chạy.</p></div> :
          <div className="auto-table-scroll"><table className="auto-table bulk-campaign-table"><thead><tr><th>Ngày tạo</th><th>Tài khoản</th><th>Số lượng</th><th>Nội dung</th><th>Lịch chạy</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
            {data.campaigns.map(campaign => {
              const sent = campaign.items.filter(item => item.status === 'sent').length
              const failed = campaign.items.filter(item => item.status === 'error').length
              const pending = campaign.items.filter(item => item.status === 'pending').length
              const isActive = data.activeCampaignId === campaign.id && data.running
              return <tr key={campaign.id}>
                <td>{new Date(campaign.createdAt).toLocaleString('vi-VN')}</td>
                <td>{accounts.find(account => account.id === campaign.settings.accountId)?.displayName || campaign.settings.accountId}</td>
                <td><strong>{campaign.items.length}</strong><small>{sent} đã gửi · {failed} lỗi</small></td>
                <td className="bulk-campaign-message">{campaign.settings.message}</td>
                <td>{campaign.settings.startTime}–{campaign.settings.endTime}<small>Giờ Việt Nam · Delay {campaign.settings.delaySeconds}s</small></td>
                <td><span className={`bulk-status ${campaign.state === 'completed' ? 'sent' : campaign.state === 'running' ? 'sending' : ''}`}>{campaignStateLabels[campaign.state]}</span></td>
                <td>{isActive
                  ? <button className="auto-button danger" disabled={busy} onClick={() => void stop()}><FiSquare /> Dừng</button>
                  : failed > 0 && pending === 0
                    ? <button className="auto-button" disabled={busy || data.running} onClick={() => void retryFailed(campaign.id)}><FiRefreshCw /> Gửi lại lỗi</button>
                    : <button className="auto-button primary" disabled={busy || data.running || campaign.state === 'completed'} onClick={() => void runCampaign(campaign.id)}><FiPlay /> Chạy</button>}
                </td>
              </tr>
            })}
          </tbody></table></div>}
      </section>

      <section className="auto-log bulk-results">
        <div className="auto-log-heading"><h2><FiMessageSquare /> Kết quả từng số</h2><div className="auto-log-heading__actions"><span className="auto-badge">{data?.items.length ?? 0} số</span><button className="auto-button" disabled={busy || data?.running || !data?.failed} onClick={() => void retryFailed()}><FiRefreshCw /> Gửi lại {data?.failed ?? 0} số lỗi</button></div></div>
        {!data?.items.length ? <div className="auto-empty"><FiPhone /><strong>Chưa có chiến dịch đang xử lý</strong><p>Chọn một cấu hình trong bảng phía trên rồi bấm “Chạy”.</p></div> :
          <div className="auto-table-scroll"><table className="auto-table bulk-table"><thead><tr><th>Số điện thoại</th><th>Tài khoản</th><th>Trạng thái</th><th>Chi tiết</th><th>Thời gian</th></tr></thead><tbody>
            {data.items.map(item => <tr key={item.id}><td><strong>{item.phone}</strong></td><td>{item.name || '—'}</td><td><span className={`bulk-status ${item.status}`}>{statusLabels[item.status]}</span></td><td>{item.detail}</td><td>{item.sentAt ? new Date(item.sentAt).toLocaleTimeString('vi-VN') : '—'}</td></tr>)}
          </tbody></table></div>}
      </section>

      {settingsOpen && <Modal title="Tạo cấu hình gửi tin hàng loạt" onClose={() => !busy && setSettingsOpen(false)} closeDisabled={busy}>
        <form className="auto-form bulk-settings" onSubmit={(event) => { event.preventDefault(); void createCampaign() }}>
          <label>Tài khoản Zalo
            <select value={selectedAccountId} onChange={event => setAccountId(event.target.value)} required>
              <option value="">Chọn tài khoản</option>
              {accounts.map(account => <option key={account.id} value={account.id}>{account.displayName} {account.phoneNumber ? `· ${account.phoneNumber}` : ''}</option>)}
            </select>
          </label>
          <label>Danh sách số điện thoại <small>Mỗi dòng một số. Hỗ trợ 03/05/07/08/09 và +84.</small>
            <textarea value={phones} onChange={event => setPhones(event.target.value)} rows={8} placeholder={'0901234567\n0912345678\n+84987654321'} required />
          </label>
          <label>Nội dung tin nhắn <small>Tối đa 2000 ký tự.</small>
            <textarea value={message} onChange={event => setMessage(event.target.value)} rows={5} maxLength={2000} placeholder="Nhập nội dung cần gửi…" required />
          </label>
          <div className="bulk-settings__row">
            <label>Bắt đầu (giờ VN)<input type="time" value={startTime} onChange={event => setStartTime(event.target.value)} required /></label>
            <label>Kết thúc (giờ VN)<input type="time" value={endTime} onChange={event => setEndTime(event.target.value)} required /></label>
            <label>Delay (giây)<input type="number" min={5} max={3600} value={delaySeconds} onChange={event => setDelaySeconds(Number(event.target.value))} required /></label>
          </div>
          <div className="auto-note">Bấm “Tạo cấu hình” chỉ lưu vào danh sách, chưa gửi tin. Sau đó bấm “Chạy” ở đúng dòng cần chạy. Khi chạy, sau mỗi 2 lượt gửi thành công liên tiếp tool nghỉ 60 giây.</div>
          {actionError && <p className="auto-error" role="alert">{actionError}</p>}
          <div className="auto-actions"><button type="button" className="auto-button" disabled={busy} onClick={() => setSettingsOpen(false)}>Hủy</button><button className="auto-button primary" disabled={busy || !selectedAccountId}><FiPlus /> {busy ? 'Đang lưu…' : 'Tạo cấu hình'}</button></div>
        </form>
      </Modal>}
    </div>
  )
}
