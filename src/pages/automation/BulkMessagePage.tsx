import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FiAlertCircle, FiArrowLeft, FiCheckCircle, FiClock, FiEdit2, FiEye, FiImage, FiMessageSquare, FiPhone, FiPlay, FiPlus, FiRefreshCw, FiSquare, FiX } from 'react-icons/fi'
import { BULK_MESSAGE_DELAY_SECONDS, BULK_MESSAGE_MAX_LOOKUP_RETRIES, BULK_MESSAGE_PAUSE_EVERY, BULK_MESSAGE_PAUSE_SECONDS } from '../../../shared/automation'
import type { BulkMessageCampaign, BulkMessageImageUpload } from '../../../shared/automation'
import { MAX_ATTACHMENT_BYTES } from '../../../shared/messages'
import Modal from '../../components/common/Modal'
import { useAccounts } from '../accounts/hooks/useAccounts'
import { useChatPolling } from '../messages/hooks/useChatPolling'
import { automationApi } from './api'
import './automation.css'
import './overview.css'

const statusLabels = { pending: 'Chờ xử lý', searching: 'Đang tìm Zalo', sending: 'Đang gửi', sent: 'Đã gửi', error: 'Lỗi' } as const
const campaignStateLabels = { ready: 'Chưa chạy', running: 'Đang chạy', stopped: 'Đã dừng', completed: 'Hoàn tất' } as const
const imageTypes: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }

async function imageUpload(file: File): Promise<BulkMessageImageUpload> {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  const mimeType = imageTypes[extension]
  if (!mimeType || (file.type && file.type !== mimeType)) throw new Error('Chỉ hỗ trợ ảnh PNG, JPG, GIF hoặc WebP.')
  if (!file.size || file.size > MAX_ATTACHMENT_BYTES) throw new Error('Ảnh phải có dung lượng từ 1 byte đến 10 MB.')
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Không đọc được ảnh đã chọn.'))
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const separator = result.indexOf(',')
      if (separator < 0) reject(new Error('Không đọc được ảnh đã chọn.'))
      else resolve(result.slice(separator + 1))
    }
    reader.readAsDataURL(file)
  })
  return { name: file.name, mimeType, base64 }
}

export default function BulkMessagePage() {
  const { accounts, error: accountError } = useAccounts()
  const { data, error, refresh } = useChatPolling(automationApi.bulkState, 1500)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null)
  const [detailsCampaignId, setDetailsCampaignId] = useState<string | null>(null)
  const [accountId, setAccountId] = useState('')
  const [phones, setPhones] = useState('')
  const [message, setMessage] = useState('')
  const [startTime, setStartTime] = useState('07:00')
  const [endTime, setEndTime] = useState('21:00')
  const delaySeconds = BULK_MESSAGE_DELAY_SECONDS
  const [dailyLimit, setDailyLimit] = useState(130)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [removeImage, setRemoveImage] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')

  const selectedAccountId = accountId || accounts[0]?.id || ''
  const editingCampaign = data?.campaigns.find(campaign => campaign.id === editingCampaignId)
  const detailsCampaign = data?.campaigns.find(campaign => campaign.id === detailsCampaignId)
  const runningCount = data?.campaigns.filter(campaign => campaign.state === 'running').length ?? 0
  const progress = useMemo(() => data?.total ? Math.round(((data.sent + data.failed) / data.total) * 100) : 0, [data])
  const runningStatus = data?.running ? (data.pausedReason ? data.pausedReason : 'Đang xử lý danh sách.') : data?.pausedReason || 'Chưa chạy'

  function openCreate() {
    setEditingCampaignId(null); setAccountId(accounts[0]?.id ?? ''); setPhones(''); setMessage('')
    setStartTime('07:00'); setEndTime('21:00'); setDailyLimit(130)
    setImageFile(null); setRemoveImage(false); setActionError(''); setSettingsOpen(true)
  }

  function openEdit(campaign: BulkMessageCampaign) {
    setEditingCampaignId(campaign.id); setAccountId(campaign.settings.accountId); setPhones('')
    setMessage(campaign.settings.message); setStartTime(campaign.settings.startTime); setEndTime(campaign.settings.endTime)
    setDailyLimit(campaign.settings.dailyLimit ?? 130)
    setImageFile(null); setRemoveImage(false); setActionError(''); setSettingsOpen(true)
  }

  async function saveCampaign() {
    setBusy(true); setActionError('')
    try {
      const image = imageFile ? await imageUpload(imageFile) : undefined
      if (editingCampaignId) {
        await automationApi.bulkUpdate({ id: editingCampaignId, accountId: selectedAccountId, message, startTime, endTime, delaySeconds, dailyLimit, image, removeImage })
      } else {
        await automationApi.bulkCreate({ accountId: selectedAccountId, phones, message, startTime, endTime, delaySeconds, dailyLimit, image })
      }
      setSettingsOpen(false); refresh()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Không lưu được cấu hình gửi tin.')
    } finally { setBusy(false) }
  }

  async function runCampaign(id: string) {
    setBusy(true); setActionError('')
    try { await automationApi.bulkStart(id); refresh() }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Không chạy được cấu hình này.') }
    finally { setBusy(false) }
  }

  async function stop(id: string) {
    setBusy(true); setActionError('')
    try { await automationApi.bulkStop(id); refresh() }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Không dừng được lượt gửi.') }
    finally { setBusy(false) }
  }

  async function retryFailed(id: string) {
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
            <div className="auto-detail-hero__title"><h1>Gửi tin hàng loạt</h1><span className={`auto-tool-status ${runningCount ? 'active' : ''}`}><i />{runningCount > 1 ? `${runningCount} danh sách đang chạy` : runningCount === 1 ? 'Đang chạy' : 'Đang tắt'}</span></div>
            <p>Tìm tài khoản Zalo theo danh sách số điện thoại, gửi nội dung và ảnh đính kèm. Mỗi tài khoản chỉ chạy một danh sách tại một thời điểm.</p>
          </div>
        </div>
        <div className="auto-detail-hero__actions">
          <Link className="auto-button" to="/automation"><FiArrowLeft /> Tất cả công cụ</Link>
          <button className="auto-button primary" disabled={busy} onClick={openCreate}><FiPlus /> Tạo cấu hình</button>
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
            <div><dt>Delay mỗi lượt</dt><dd>{BULK_MESSAGE_DELAY_SECONDS} giây</dd></div>
            <div><dt>Giới hạn mỗi ngày</dt><dd>{data?.settings?.dailyLimit ?? 130} tin gửi thành công</dd></div>
            <div><dt>Nghỉ định kỳ</dt><dd>Sau {BULK_MESSAGE_PAUSE_EVERY} lượt thành công · nghỉ {BULK_MESSAGE_PAUSE_SECONDS} giây</dd></div>
            <div><dt>Hiện tại</dt><dd>{runningStatus}</dd></div>
            {data?.nextActionAt && <div><dt>Lượt tiếp theo</dt><dd>{new Date(data.nextActionAt).toLocaleString('vi-VN')}</dd></div>}
          </dl>
        </section>

        <section className="auto-detail-card">
          <div className="auto-detail-card__heading"><div><span>01</span><h2>Luồng xử lý</h2></div></div>
          <ol className="auto-process">
            <li><span>1</span><div><strong>Đọc từng số điện thoại</strong><p>Danh sách nhập theo dạng mỗi dòng một số, tự bỏ số trùng.</p></div></li>
            <li><span>2</span><div><strong>Tìm và chờ phản hồi Zalo</strong><p>Tra cứu lỗi sẽ thử lại tối đa {BULK_MESSAGE_MAX_LOOKUP_RETRIES} lần; các số khác vẫn tiếp tục chạy.</p></div></li>
            <li><span>3</span><div><strong>Giữ số còn lại đến ngày sau</strong><p>Đạt giới hạn tin thành công trong ngày thì danh sách chờ đến ngày mai và tự chạy tiếp.</p></div></li>
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
              const hasPending = campaign.items.some(item => item.status === 'pending')
              const isActive = campaign.state === 'running'
              const accountBusy = data.campaigns.some(other => other.id !== campaign.id && other.settings.accountId === campaign.settings.accountId && other.state === 'running')
              const itemInFlight = campaign.items.some(item => item.status === 'searching' || item.status === 'sending')
              const canEdit = !isActive && !itemInFlight
              return <tr key={campaign.id}>
                <td>{new Date(campaign.createdAt).toLocaleString('vi-VN')}</td>
                <td>{accounts.find(account => account.id === campaign.settings.accountId)?.displayName || campaign.settings.accountId}</td>
                <td><strong>{campaign.items.length}</strong><small>{sent} đã gửi · {failed} lỗi</small></td>
                <td className="bulk-campaign-message">{campaign.settings.message}{campaign.settings.image && <small><FiImage /> {campaign.settings.image.name}</small>}</td>
                <td>{campaign.settings.startTime}–{campaign.settings.endTime}<small>Giờ VN · Delay {BULK_MESSAGE_DELAY_SECONDS}s · Tối đa {campaign.settings.dailyLimit ?? 130}/ngày</small></td>
                <td><span className={`bulk-status ${campaign.state === 'completed' ? 'sent' : campaign.state === 'running' ? 'sending' : ''}`}>{campaignStateLabels[campaign.state]}</span></td>
                <td><div className="bulk-campaign-actions">
                  {isActive
                    ? <button className="auto-button danger" disabled={busy} onClick={() => void stop(campaign.id)}><FiSquare /> Dừng</button>
                    : itemInFlight
                      ? <button className="auto-button" disabled>Đang hoàn tất lượt gửi</button>
                      : failed > 0
                        ? <>
                            {hasPending && <button className="auto-button primary" disabled={busy || accountBusy} onClick={() => void runCampaign(campaign.id)}><FiPlay /> Tiếp tục</button>}
                            <button className="auto-button" disabled={busy || accountBusy} onClick={() => void retryFailed(campaign.id)}><FiRefreshCw /> Gửi lại lỗi</button>
                          </>
                        : <button className="auto-button primary" disabled={busy || accountBusy || campaign.state === 'completed'} onClick={() => void runCampaign(campaign.id)}><FiPlay /> Chạy</button>}
                  <button className="auto-button" disabled={busy} onClick={() => setDetailsCampaignId(campaign.id)}><FiEye /> Chi tiết</button>
                  <button className="auto-button" disabled={busy || !canEdit} title={!canEdit ? 'Dừng và chờ lượt đang xử lý hoàn tất để chỉnh sửa.' : undefined} onClick={() => openEdit(campaign)}><FiEdit2 /> Chỉnh sửa</button>
                </div></td>
              </tr>
            })}
          </tbody></table></div>}
      </section>

      {settingsOpen && <Modal title={editingCampaignId ? 'Chỉnh sửa cấu hình gửi tin' : 'Tạo cấu hình gửi tin hàng loạt'} onClose={() => !busy && setSettingsOpen(false)} closeDisabled={busy}>
        <form className="auto-form bulk-settings" onSubmit={(event) => { event.preventDefault(); void saveCampaign() }}>
          <label>Tài khoản Zalo
            <select value={selectedAccountId} onChange={event => setAccountId(event.target.value)} required>
              <option value="">Chọn tài khoản</option>
              {accounts.map(account => <option key={account.id} value={account.id}>{account.displayName} {account.phoneNumber ? `· ${account.phoneNumber}` : ''}</option>)}
            </select>
          </label>
          {!editingCampaignId && <label>Danh sách số điện thoại <small>Mỗi dòng một số. Hỗ trợ 03/05/07/08/09 và +84.</small>
            <textarea value={phones} onChange={event => setPhones(event.target.value)} rows={7} placeholder={'0901234567\n0912345678\n+84987654321'} required />
          </label>}
          <label>Nội dung tin nhắn <small>Tối đa 2000 ký tự.</small>
            <textarea value={message} onChange={event => setMessage(event.target.value)} rows={5} maxLength={2000} placeholder="Nhập nội dung cần gửi…" required />
          </label>
          <label>Ảnh gửi kèm <small>PNG, JPG, GIF hoặc WebP · tối đa 10 MB.</small>
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={event => { setImageFile(event.target.files?.[0] ?? null); setRemoveImage(false) }} />
            {imageFile && <span className="bulk-image-name"><FiImage /> Ảnh mới: {imageFile.name}</span>}
            {!imageFile && editingCampaign?.settings.image && !removeImage && <span className="bulk-image-name"><FiImage /> Ảnh hiện tại: {editingCampaign.settings.image.name}</span>}
            {(imageFile || (editingCampaign?.settings.image && !removeImage)) && <button type="button" className="bulk-image-remove" onClick={() => { setImageFile(null); setRemoveImage(Boolean(editingCampaign?.settings.image)); const input = document.querySelector<HTMLInputElement>('.bulk-settings input[type="file"]'); if (input) input.value = '' }}><FiX /> Bỏ ảnh</button>}
          </label>
          <div className="bulk-settings__row">
            <label>Bắt đầu (giờ VN)<input type="time" value={startTime} onChange={event => setStartTime(event.target.value)} required /></label>
            <label>Kết thúc (giờ VN)<input type="time" value={endTime} onChange={event => setEndTime(event.target.value)} required /></label>
          </div>
          <label>Giới hạn tin gửi thành công mỗi ngày
            <input type="number" min={1} max={10000} value={dailyLimit} onChange={event => setDailyLimit(Number(event.target.value))} required />
            <small>Đạt giới hạn thì giữ các số còn lại trong danh sách, ngày mai tự chạy tiếp từ giờ bắt đầu.</small>
          </label>
          {editingCampaignId && <div className="auto-note">Các số và kết quả hiện có được giữ nguyên. Nội dung và ảnh mới áp dụng cho các số còn chờ gửi.</div>}
          {!editingCampaignId && <div className="auto-note">Tạo cấu hình chỉ lưu vào danh sách, chưa gửi tin. Mỗi tin cách nhau {BULK_MESSAGE_DELAY_SECONDS} giây; sau {BULK_MESSAGE_PAUSE_EVERY} tin gửi thành công liên tiếp, tool nghỉ {BULK_MESSAGE_PAUSE_SECONDS} giây.</div>}
          {actionError && <p className="auto-error" role="alert">{actionError}</p>}
          <div className="auto-actions"><button type="button" className="auto-button" disabled={busy} onClick={() => setSettingsOpen(false)}>Hủy</button><button className="auto-button primary" disabled={busy || !selectedAccountId}><FiPlus /> {busy ? 'Đang lưu…' : editingCampaignId ? 'Lưu chỉnh sửa' : 'Tạo cấu hình'}</button></div>
        </form>
      </Modal>}

      {detailsCampaign && <Modal title={`Kết quả từng số · ${detailsCampaign.items.length} số`} onClose={() => setDetailsCampaignId(null)}>
        <div className="bulk-detail-modal">
          <div className="bulk-detail-summary"><span>{accounts.find(account => account.id === detailsCampaign.settings.accountId)?.displayName || detailsCampaign.settings.accountId}</span><span>{campaignStateLabels[detailsCampaign.state]}</span><span>{detailsCampaign.items.filter(item => item.status === 'sent').length} đã gửi</span><span>{detailsCampaign.items.filter(item => item.status === 'error').length} lỗi</span></div>
          {detailsCampaign.state !== 'running' && detailsCampaign.items.some(item => item.status === 'pending') && <button className="auto-button primary" disabled={busy} onClick={() => void runCampaign(detailsCampaign.id)}><FiPlay /> Tiếp tục số đang chờ</button>}
          {detailsCampaign.items.some(item => item.status === 'error') && detailsCampaign.state !== 'running' && <button className="auto-button" disabled={busy} onClick={() => void retryFailed(detailsCampaign.id)}><FiRefreshCw /> Gửi lại số lỗi</button>}
          {!detailsCampaign.items.length ? <div className="auto-empty"><FiPhone /><strong>Danh sách chưa có số điện thoại</strong></div> :
            <div className="auto-table-scroll bulk-detail-scroll"><table className="auto-table bulk-table"><thead><tr><th>Số điện thoại</th><th>Tài khoản</th><th>Trạng thái</th><th>Chi tiết</th><th>Thời gian</th></tr></thead><tbody>
              {detailsCampaign.items.map(item => {
                const waitingForRetry = Boolean(item.retryAt && item.retryAt > Date.now())
                return <tr key={item.id}><td><strong>{item.phone}</strong></td><td>{item.name || '—'}</td><td><span className={`bulk-status ${waitingForRetry ? 'searching' : item.status}`}>{waitingForRetry ? 'Chờ thử lại' : statusLabels[item.status]}</span></td><td>{item.detail}</td><td>{item.sentAt ? new Date(item.sentAt).toLocaleString('vi-VN') : '—'}</td></tr>
              })}
            </tbody></table></div>}
        </div>
      </Modal>}
    </div>
  )
}
