import { useEffect, useState } from 'react'
import { FiCheckCircle, FiRefreshCw, FiSmartphone, FiAlertCircle } from 'react-icons/fi'
import { Modal } from '../../../components/common'
import { useQrLogin } from '../hooks/useQrLogin'

interface QrLoginModalProps { onClose: () => void; onSuccess: () => void }

export default function QrLoginModal({ onClose, onSuccess }: QrLoginModalProps) {
  const { session, error, retry } = useQrLogin(onSuccess)
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  const status = session?.status ?? 'initializing'
  const seconds = session?.expiresAt ? Math.max(0, Math.ceil((Date.parse(session.expiresAt) - now) / 1000)) : null
  const expired = status === 'expired' || (status === 'qr_ready' && seconds === 0)
  const failed = Boolean(error) || ['error', 'declined', 'cancelled'].includes(status) || expired
  const success = status === 'success'
  const scanned = status === 'scanned' || status === 'authenticating'
  const message = error || session?.error || (expired ? 'Mã QR đã hết hạn. Tạo mã mới để tiếp tục.' : status === 'declined' ? 'Bạn đã từ chối đăng nhập trên điện thoại.' : 'Phiên đăng nhập đã được hủy.')

  return (
    <Modal title="Thêm tài khoản Zalo" onClose={onClose}>
      <div className="qr-login">
        <p className="qr-login__intro">Mở Zalo trên điện thoại, quét mã QR và xác nhận đăng nhập.</p>
        <div className={`qr-login__frame${success ? ' qr-login__frame--success' : ''}`}>
          {success ? (
            <div className="qr-login__state"><FiCheckCircle /><strong>Kết nối thành công</strong><span>{session?.account?.displayName}</span></div>
          ) : failed ? (
            <div className="qr-login__state qr-login__state--error"><FiAlertCircle /><strong>{expired ? 'Mã QR đã hết hạn' : 'Chưa thể kết nối'}</strong><span>Vui lòng thử lại</span></div>
          ) : scanned ? (
            <div className="qr-login__state"><FiSmartphone /><strong>{status === 'scanned' ? 'Đã quét mã QR' : 'Đang đăng nhập…'}</strong><span>{session?.displayName || 'Vui lòng xác nhận trên điện thoại'}</span><span className="accounts-spinner" /></div>
          ) : session?.qrImage ? (
            <img className="qr-login__image" src={session.qrImage} alt="Mã QR đăng nhập Zalo" width="240" height="240" />
          ) : <div className="qr-login__state"><span className="accounts-spinner" /><strong>Đang tạo mã QR…</strong><span>Vui lòng đợi trong giây lát</span></div>}
        </div>
        {failed ? <p className="accounts-error" role="alert">{message}</p> : (
          <p className="qr-login__status" role="status">
            {success ? 'Tài khoản đã được thêm vào danh sách.' : scanned ? 'Xác nhận đăng nhập trong ứng dụng Zalo để hoàn tất.' : session?.qrImage ? `Mã QR còn hiệu lực ${seconds ?? 100} giây` : 'Đang kết nối tới Zalo…'}
          </p>
        )}
        {!success && <ol className="qr-login__steps"><li>Mở ứng dụng <strong>Zalo</strong> trên điện thoại.</li><li>Chọn biểu tượng <strong>quét QR</strong> và quét mã phía trên.</li><li>Nhấn <strong>Đăng nhập</strong> để xác nhận.</li></ol>}
        <div className="qr-login__actions">
          {success ? <button type="button" className="accounts-button accounts-button--primary" onClick={onClose}>Hoàn tất</button> : failed ? (
            <button type="button" className="accounts-button accounts-button--primary" onClick={retry}><FiRefreshCw /> Tạo mã QR mới</button>
          ) : <button type="button" className="accounts-button" onClick={onClose}>Hủy đăng nhập</button>}
        </div>
      </div>
    </Modal>
  )
}
