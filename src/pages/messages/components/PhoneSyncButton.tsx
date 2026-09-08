import { useCallback, useState } from 'react'
import { FiArrowRight, FiMonitor, FiSmartphone } from 'react-icons/fi'
import { Modal } from '../../../components/common'
import { chatApi } from '../api'
import { useChatPolling } from '../hooks/useChatPolling'

function PhoneSyncModal({ accountId, accountName, onClose }: { accountId: string; accountName: string; onClose: () => void }) {
  const loader = useCallback((signal: AbortSignal) => chatApi.phoneSync(accountId, signal), [accountId])
  const { data, error, refresh } = useChatPolling(loader, 1_000)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const busy = Boolean(data && ['requesting', 'awaiting_confirmation', 'downloading', 'decrypting', 'importing'].includes(data.status))
  const title = data?.status === 'completed' ? 'Đồng bộ hoàn tất' : data?.status === 'error' ? 'Đồng bộ chưa hoàn tất' : busy ? 'Đang đồng bộ từ điện thoại' : 'Đồng bộ lịch sử từ điện thoại'
  return <Modal title="Đồng bộ từ điện thoại" onClose={onClose}>
    <div className="phone-sync">
      <p className="phone-sync__account">Tài khoản: <strong>{accountName}</strong></p>
      <div className="phone-sync__devices" aria-hidden="true"><FiSmartphone /><FiArrowRight /><FiMonitor /></div>
      <div className="phone-sync__status" role="status">
        <h3>{title}</h3>
        <p>{data?.reason || 'Đang kiểm tra trạng thái kết nối…'}</p>
        {typeof data?.progress === 'number' && <progress max={100} value={data.progress} aria-label="Tiến độ đồng bộ" />}
      </div>
      {(error || submitError) && <p className="chat-error" role="alert">{submitError || error}</p>}
      <ol className="phone-sync__steps"><li>Bấm gửi yêu cầu ở đây.</li><li>Mở Zalo trên điện thoại và chọn <strong>Đồng bộ ngay</strong>.</li><li>Giữ backend đang chạy trong lúc tải và nhập dữ liệu.</li></ol>
      <p className="phone-sync__note">Backup gốc được giữ ở dạng mã hóa trong thư mục <strong>.data/phone-sync</strong>. File đã giải mã chỉ tồn tại tạm thời trong lúc nhập và được xóa ngay sau đó.</p>
      <div className="phone-sync__actions">
        <button type="button" className="phone-sync__close" onClick={onClose}>Về tin nhắn</button>
        <button type="button" className="chat-send" disabled={busy || submitting} onClick={async () => {
          setSubmitting(true); setSubmitError('')
          try { await chatApi.requestPhoneSync(accountId); refresh() }
          catch (cause) { setSubmitError(cause instanceof Error ? cause.message : 'Không gửi được yêu cầu đồng bộ.') }
          finally { setSubmitting(false) }
        }}>{submitting ? 'Đang gửi…' : data?.status === 'error' || data?.status === 'completed' ? 'Đồng bộ lại' : 'Gửi yêu cầu'}</button>
      </div>
    </div>
  </Modal>
}

export default function PhoneSyncButton({ accountId, accountName }: { accountId: string; accountName: string }) {
  const [open, setOpen] = useState(false)
  return <>
    <button type="button" className="phone-sync-trigger" onClick={() => setOpen(true)}><FiSmartphone aria-hidden="true" />Đồng bộ từ điện thoại</button>
    {open && <PhoneSyncModal accountId={accountId} accountName={accountName} onClose={() => setOpen(false)} />}
  </>
}
