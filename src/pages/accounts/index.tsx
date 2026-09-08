import { useCallback, useMemo, useState } from 'react'
import { FiChevronLeft, FiChevronRight, FiPlus, FiRefreshCw, FiSearch, FiTrash2, FiUsers } from 'react-icons/fi'
import { Dropdown, Input, Modal } from '../../components/common'
import type { Account, AccountStatus } from '../../../shared/accounts'
import { useAccounts } from './hooks/useAccounts'
import { accountsApi } from './api'
import QrLoginModal from './components/QrLoginModal'
import './accounts.css'

const statusLabels: Record<AccountStatus, string> = { connected: 'Đã đăng nhập', restoring: 'Đang khôi phục', expired: 'Cần đăng nhập lại' }
const pageSize = 10
function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}
function AccountAvatar({ account }: { account: Account }) {
  const [failed, setFailed] = useState(false)
  return <span className="account-avatar">
    {!failed && /^https?:\/\//.test(account.avatar) ? <img src={account.avatar} alt="" onError={() => setFailed(true)} referrerPolicy="no-referrer" /> : account.displayName.slice(0, 1).toUpperCase()}
  </span>
}

export default function AccountsPage() {
  const { accounts, loading, error, refresh } = useAccounts()
  const [loginOpen, setLoginOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<AccountStatus | ''>('')
  const [page, setPage] = useState(1)
  const [toDelete, setToDelete] = useState<Account | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const handleSuccess = useCallback(() => { void refresh() }, [refresh])
  const closeLogin = () => { setLoginOpen(false); void refresh() }
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    return accounts.filter((account) => (!status || account.status === status) &&
      [account.displayName, account.id, account.phoneNumber].some((value) => value.toLocaleLowerCase().includes(term)))
  }, [accounts, query, status])
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const connected = accounts.filter((account) => account.status === 'connected').length

  async function removeAccount() {
    if (!toDelete) return
    setDeleting(true)
    setDeleteError('')
    try { await accountsApi.remove(toDelete.id); setToDelete(null); await refresh() }
    catch (cause) { setDeleteError(cause instanceof Error ? cause.message : 'Không thể xóa tài khoản.') }
    finally { setDeleting(false) }
  }

  return (
    <div className="accounts-page">
      <header className="accounts-heading">
        <div><span className="page-eyebrow">Không gian làm việc</span><h1>Tài khoản</h1><p>Kết nối và quản lý các tài khoản Zalo cá nhân của bạn.</p></div>
        <button type="button" className="accounts-button accounts-button--primary" onClick={() => setLoginOpen(true)}><FiPlus aria-hidden="true" />Thêm tài khoản</button>
      </header>

      <section className="accounts-table-card" aria-label="Danh sách tài khoản">
        <div className="accounts-table-heading">
          <div className="accounts-table-title"><span className="accounts-title-icon"><FiUsers aria-hidden="true" /></span><h2>Danh sách tài khoản</h2><span className="accounts-count">{loading || error ? '—' : accounts.length}</span></div>
          <span className="accounts-connected"><span className="status-dot" />{loading || error ? 'Chờ cập nhật' : `${connected} tài khoản đã đăng nhập`}</span>
        </div>
        <div className="accounts-toolbar">
          <div className="accounts-search"><FiSearch aria-hidden="true" /><Input type="search" aria-label="Tìm tài khoản" placeholder="Tìm theo tên, số điện thoại hoặc UID…" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} /></div>
          <Dropdown<AccountStatus | ''> aria-label="Lọc trạng thái tài khoản" wrapperClassName="accounts-filter"
            placeholder="Tất cả trạng thái" value={status} onChange={(value) => { setStatus(value); setPage(1) }}
            options={[{ value: '', label: 'Tất cả trạng thái' }, { value: 'connected', label: 'Đã đăng nhập' }, { value: 'restoring', label: 'Đang khôi phục' }, { value: 'expired', label: 'Cần đăng nhập lại' }]} />
          <button type="button" className="accounts-button accounts-refresh" title="Làm mới danh sách" aria-label="Làm mới danh sách" onClick={() => void refresh()}><FiRefreshCw aria-hidden="true" /></button>
        </div>
        {error && <div className="accounts-load-error" role="alert">{error}</div>}
        <div className="accounts-table-scroll">
          <table className="accounts-table" data-empty={loading || visible.length === 0}>
            <thead><tr><th scope="col">STT</th><th scope="col">Tài khoản</th><th scope="col">UID Zalo</th><th scope="col">Số điện thoại</th><th scope="col">Trạng thái</th><th scope="col">Đăng nhập gần nhất</th><th scope="col" className="accounts-action-column">Thao tác</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={7}><div className="accounts-empty" role="status"><span className="accounts-spinner" /><p>Đang tải danh sách tài khoản…</p></div></td></tr> :
                visible.length > 0 ? visible.map((account, index) => (
                  <tr key={account.id}>
                    <td className="accounts-row-number">{(currentPage - 1) * pageSize + index + 1}</td>
                    <td><div className="account-cell"><AccountAvatar key={account.avatar} account={account} /><div><strong>{account.displayName}</strong><small>Tài khoản cá nhân</small></div></div></td>
                    <td className="accounts-uid">{account.id}</td>
                    <td>{account.phoneNumber || 'Chưa cung cấp'}</td>
                    <td><span className={`account-status account-status--${account.status}`}><span />{statusLabels[account.status]}</span></td>
                    <td className="accounts-date">{formatDate(account.lastLoginAt)}</td>
                    <td className="accounts-action-column"><button type="button" className="accounts-delete" aria-label={`Xóa ${account.displayName}`} title="Xóa khỏi công cụ" onClick={() => { setToDelete(account); setDeleteError('') }}><FiTrash2 aria-hidden="true" /></button></td>
                  </tr>
                )) : <tr><td colSpan={7}><div className="accounts-empty"><span className="accounts-empty__icon"><FiUsers aria-hidden="true" /></span><h3>{error ? 'Chưa tải được dữ liệu' : accounts.length ? 'Không tìm thấy tài khoản phù hợp' : 'Chưa có tài khoản Zalo'}</h3><p>{error ? 'Làm mới danh sách sau khi dịch vụ kết nối trở lại.' : accounts.length ? 'Thử từ khóa hoặc bộ lọc khác.' : 'Thêm tài khoản bằng mã QR để bắt đầu quản lý.'}</p>{!error && !accounts.length && <button type="button" className="accounts-button" onClick={() => setLoginOpen(true)}><FiPlus />Thêm tài khoản đầu tiên</button>}</div></td></tr>}
            </tbody>
          </table>
        </div>
        <footer className="accounts-pagination">
          <span>{filtered.length ? `Hiển thị ${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, filtered.length)} trên ${filtered.length} tài khoản` : '0 tài khoản'}</span>
          <div><span>10 / trang</span><button type="button" className="accounts-button" aria-label="Trang trước" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}><FiChevronLeft /></button><span className="accounts-current-page">{currentPage}</span><button type="button" className="accounts-button" aria-label="Trang sau" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}><FiChevronRight /></button></div>
        </footer>
      </section>
      <p className="accounts-storage-note">Phiên đăng nhập được lưu ở máy chủ của công cụ để khôi phục khi khởi động lại.</p>
      {loginOpen && <QrLoginModal onClose={closeLogin} onSuccess={handleSuccess} />}
      {toDelete && <Modal title="Xóa tài khoản khỏi công cụ?" role="alertdialog" closeDisabled={deleting} onClose={() => { if (!deleting) setToDelete(null) }}>
        <p className="accounts-delete-description">Xóa <strong>{toDelete.displayName}</strong> và phiên đăng nhập đã lưu khỏi công cụ. Bạn có thể thêm lại bằng mã QR; thao tác này không xóa tài khoản Zalo.</p>
        {deleteError && <p className="accounts-error" role="alert">{deleteError}</p>}
        <div className="accounts-confirm-actions"><button type="button" className="accounts-button" disabled={deleting} onClick={() => setToDelete(null)}>Hủy</button><button type="button" className="accounts-button accounts-button--danger" disabled={deleting} onClick={() => void removeAccount()}>{deleting ? 'Đang xóa…' : 'Xóa tài khoản'}</button></div>
      </Modal>}
    </div>
  )
}

