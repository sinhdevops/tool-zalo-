import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FiAlertTriangle, FiRefreshCw, FiTrash2, FiUsers } from 'react-icons/fi'
import { Modal } from '../../components/common'
import type { Account } from '../../../shared/accounts'
import { accountsApi } from '../accounts/api'
import { friendsApi } from './api'
import type { FriendContact } from './api'
import './friends.css'

function orderOldest(friends: FriendContact[]) {
  return friends.map((friend, index) => ({ friend, index }))
    .sort((a, b) => (a.friend.createdAt ?? Number.POSITIVE_INFINITY) - (b.friend.createdAt ?? Number.POSITIVE_INFINITY) || a.index - b.index)
    .map(({ friend }) => friend)
}

function formatFriendDate(value: number | null) {
  if (value === null) return 'Không có dữ liệu thời gian'
  const timestamp = value < 1_000_000_000_000 ? value * 1000 : value
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? 'Không có dữ liệu thời gian' : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(date)
}

function FriendAvatar({ friend }: { friend: FriendContact }) {
  const [failed, setFailed] = useState(false)
  return <span className="friends-avatar">
    {!failed && /^https?:\/\//.test(friend.avatar) ? <img src={friend.avatar} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : friend.name.slice(0, 1).toUpperCase()}
  </span>
}

export default function FriendsPage() {
  const [mode, setMode] = useState<'manual' | 'oldest'>('manual')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountId, setAccountId] = useState('')
  const [friends, setFriends] = useState<FriendContact[]>([])
  const [count, setCount] = useState('1')
  const [loadingAccounts, setLoadingAccounts] = useState(true)
  const [loadingFriends, setLoadingFriends] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [pageSize, setPageSize] = useState(100)
  const [page, setPage] = useState(1)
  const selectPageRef = useRef<HTMLInputElement>(null)
  const orderedFriends = useMemo(() => orderOldest(friends), [friends])
  const quantity = Number(count)
  const manualSelection = orderedFriends.filter((friend) => selectedIds.has(friend.id))
  const knownDates = orderedFriends.filter((friend) => friend.createdAt !== null)
  const selected = mode === 'manual' ? manualSelection : knownDates.slice(0, Number.isSafeInteger(quantity) && quantity > 0 ? Math.min(quantity, 500) : 0)
  const pageCount = Math.max(1, Math.ceil(orderedFriends.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const pageFriends = orderedFriends.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const selectedOnPage = pageFriends.filter((friend) => selectedIds.has(friend.id)).length
  const allOnPageSelected = pageFriends.length > 0 && selectedOnPage === pageFriends.length
  const someOnPageSelected = selectedOnPage > 0 && !allOnPageSelected

  useEffect(() => {
    if (selectPageRef.current) selectPageRef.current.indeterminate = someOnPageSelected
  }, [someOnPageSelected])

  const loadAccounts = useCallback(async () => {
    setLoadingAccounts(true)
    setError('')
    try {
      const result = await accountsApi.list()
      setAccounts(result.accounts)
      setAccountId((current) => result.accounts.some((account) => account.id === current && account.status === 'connected')
        ? current : result.accounts.find((account) => account.status === 'connected')?.id ?? '')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không tải được tài khoản.')
    } finally { setLoadingAccounts(false) }
  }, [])

  const loadFriends = useCallback(async (id: string) => {
    if (!id) { setFriends([]); return }
    setLoadingFriends(true)
    setError('')
    setNotice('')
    try {
      const nextFriends = (await friendsApi.list(id)).friends
      setFriends(nextFriends)
      const currentIds = new Set(nextFriends.map((friend) => friend.id))
      setSelectedIds((current) => new Set([...current].filter((friendId) => currentIds.has(friendId))))
      setPage(1)
    }
    catch (cause) { setFriends([]); setError(cause instanceof Error ? cause.message : 'Không tải được danh sách bạn bè.') }
    finally { setLoadingFriends(false) }
  }, [])

  useEffect(() => { void loadAccounts() }, [loadAccounts])
  useEffect(() => { void loadFriends(accountId) }, [accountId, loadFriends])

  async function removeSelected() {
    if (!accountId || selected.length === 0) return
    setDeleting(true)
    setError('')
    setNotice('')
    try {
      const result = mode === 'manual'
        ? await friendsApi.removeSelected(accountId, selected.map((friend) => friend.id))
        : await friendsApi.removeOldest(accountId, selected.length)
      const successes = result.removed.length
      const failures = result.failed.length
      setNotice(failures
        ? `Đã xóa ${successes}/${result.requested} bạn. ${failures} trường hợp không xóa được; danh sách đã cập nhật.`
        : mode === 'manual' ? `Đã xóa ${successes} bạn bạn đã chọn.` : `Đã xóa ${successes} bạn theo thứ tự kết bạn lâu nhất.`)
      setSelectedIds(new Set())
      setConfirmOpen(false)
      await loadFriends(accountId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không xóa được bạn bè.')
      setConfirmOpen(false)
      await loadFriends(accountId)
    } finally { setDeleting(false) }
  }

  const activeAccount = accounts.find((account) => account.id === accountId)

  return (
    <div className="friends-page">
      <header className="friends-heading">
        <div><span className="page-eyebrow">Không gian làm việc</span><h1>Bạn bè</h1><p>Xem danh sách và xóa bạn bè theo thứ tự kết bạn lâu nhất.</p></div>
      </header>

      <section className="friends-panel" aria-label="Quản lý bạn bè">
        <div className="friends-panel__heading">
          <div className="friends-panel__title"><span className="friends-panel__icon"><FiUsers aria-hidden="true" /></span><div><h2>Danh sách bạn bè</h2><p>{loadingFriends ? 'Đang tải danh sách từ Zalo…' : `${friends.length} bạn bè`}</p></div></div>
          <button type="button" className="friends-button" onClick={() => void loadFriends(accountId)} disabled={!accountId || loadingFriends || deleting} aria-label="Làm mới danh sách bạn bè"><FiRefreshCw aria-hidden="true" />Làm mới</button>
        </div>

        <div className="friends-mode-switch" role="group" aria-label="Cách chọn bạn bè cần xóa">
          <button type="button" aria-pressed={mode === 'manual'} className={mode === 'manual' ? 'friends-mode-switch__active' : ''} onClick={() => setMode('manual')}>Chọn từng người</button>
          <button type="button" aria-pressed={mode === 'oldest'} className={mode === 'oldest' ? 'friends-mode-switch__active' : ''} onClick={() => setMode('oldest')}>Xóa theo ngày kết bạn</button>
        </div>

        <div className="friends-controls">
          <label className="friends-field"><span>Tài khoản Zalo</span><select value={accountId} onChange={(event) => { setAccountId(event.target.value); setSelectedIds(new Set()); setPage(1); setNotice('') }} disabled={loadingAccounts || deleting}>
            <option value="">{loadingAccounts ? 'Đang tải tài khoản…' : 'Chọn tài khoản đã kết nối'}</option>
            {accounts.map((account) => <option key={account.id} value={account.id} disabled={account.status !== 'connected'}>{account.displayName}{account.status !== 'connected' ? ' · Cần kết nối' : ''}</option>)}
          </select></label>
          {mode === 'oldest' ? <label className="friends-field friends-field--count"><span>Số bạn muốn xóa</span><input type="number" min="1" max={Math.min(500, knownDates.length)} step="1" value={count} onChange={(event) => setCount(event.target.value)} disabled={!accountId || loadingFriends || deleting} /></label> : <div className="friends-selected-count">Đã chọn <strong>{manualSelection.length}</strong> / 1.000 người</div>}
          <button type="button" className="friends-button friends-button--danger" disabled={!accountId || loadingFriends || deleting || selected.length === 0 || selected.length > (mode === 'manual' ? 1000 : 500) || (mode === 'oldest' && (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 500))} onClick={() => setConfirmOpen(true)}><FiTrash2 aria-hidden="true" />Xóa {selected.length} người đã {mode === 'manual' ? 'chọn' : 'kết bạn lâu nhất'}</button>
        </div>

        <div className="friends-hint"><FiAlertTriangle aria-hidden="true" /><span>{mode === 'manual' ? `Đánh dấu checkbox đúng những người bạn muốn xóa. Người không được chọn sẽ được giữ lại. Nên dùng cách này khi Zalo không cung cấp ngày kết bạn. Tối đa 1.000 người mỗi lượt.${manualSelection.length > 1000 ? ' Bạn đã chọn quá 1.000 người; hãy bỏ chọn bớt để tiếp tục.' : ''}` : 'Chỉ xóa những người có ngày kết bạn do Zalo cung cấp, theo thứ tự lâu nhất trước. Người không có ngày kết bạn sẽ luôn được giữ lại. Mỗi lượt tối đa 500 người.'}</span></div>
        {error && <p className="friends-message friends-message--error" role="alert">{error}</p>}
        {notice && <p className="friends-message friends-message--success" role="status">{notice}</p>}

        {loadingAccounts ? <div className="friends-empty"><span className="friends-spinner" /><p>Đang tải tài khoản…</p></div> : !accounts.length ? <div className="friends-empty"><FiUsers aria-hidden="true" /><h3>Chưa có tài khoản Zalo</h3><p>Thêm tài khoản ở trang Tài khoản để xem danh sách bạn bè.</p></div> : !activeAccount ? <div className="friends-empty"><FiUsers aria-hidden="true" /><h3>Chọn một tài khoản đã kết nối</h3><p>Tài khoản cần đăng nhập để tải danh sách bạn bè từ Zalo.</p></div> : loadingFriends ? <div className="friends-empty"><span className="friends-spinner" /><p>Đang tải bạn bè từ Zalo…</p></div> : friends.length === 0 ? <div className="friends-empty"><FiUsers aria-hidden="true" /><h3>{error ? 'Chưa tải được danh sách' : 'Không có bạn bè'}</h3><p>{error ? 'Kiểm tra kết nối tài khoản rồi làm mới danh sách.' : 'Danh sách bạn bè của tài khoản này đang trống.'}</p></div> : <div className="friends-table-wrap"><table className="friends-table"><thead><tr>{mode === 'manual' && <th scope="col"><label className="friends-select-page"><input ref={selectPageRef} className="friends-checkbox" type="checkbox" checked={allOnPageSelected} aria-label="Chọn tất cả bạn bè trên trang này" onChange={(event) => setSelectedIds((current) => { const next = new Set(current); for (const friend of pageFriends) { if (event.target.checked) next.add(friend.id); else next.delete(friend.id) } return next })} /><span>Chọn trang</span></label></th>}<th scope="col">STT</th><th scope="col">Bạn bè</th><th scope="col">UID Zalo</th><th scope="col">Thời gian kết bạn</th><th scope="col">{mode === 'manual' ? 'Trạng thái' : 'Thứ tự xóa'}</th></tr></thead><tbody>
          {pageFriends.map((friend, index) => {
            const rowNumber = (currentPage - 1) * pageSize + index + 1
            const willDelete = selected.some((item) => item.id === friend.id)
            return <tr key={friend.id} className={willDelete ? 'friends-row--selected' : undefined}>
              {mode === 'manual' && <td><input className="friends-checkbox" type="checkbox" aria-label={`Chọn xóa ${friend.name}`} checked={selectedIds.has(friend.id)} disabled={deleting} onChange={(event) => setSelectedIds((current) => { const next = new Set(current); if (event.target.checked) next.add(friend.id); else next.delete(friend.id); return next })} /></td>}
              <td>{rowNumber}</td><td><div className="friends-person"><FriendAvatar friend={friend} /><strong>{friend.name}</strong></div></td><td className="friends-uid">{friend.id}</td><td>{formatFriendDate(friend.createdAt)}</td>
              <td>{mode === 'manual' ? willDelete ? <span className="friends-order">Sẽ xóa</span> : <span className="friends-muted">Được giữ lại</span> : willDelete ? <span className="friends-order">Sẽ xóa #{knownDates.findIndex((item) => item.id === friend.id) + 1}</span> : friend.createdAt === null ? <span className="friends-muted">Thiếu ngày · được giữ</span> : <span className="friends-muted">Không nằm trong số lượng chọn</span>}</td>
            </tr>
          })}
        </tbody></table>
          <div className="friends-pagination">
            <span>{orderedFriends.length ? `Hiển thị ${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, orderedFriends.length)} trên ${orderedFriends.length} bạn bè` : '0 bạn bè'}{mode === 'manual' && manualSelection.length > 0 ? ` · Đã chọn ${manualSelection.length} ở tất cả các trang` : ''}</span>
            <div className="friends-pagination__actions">
              <label>Số dòng<select aria-label="Số bạn bè mỗi trang" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }}>
                {[100, 200, 500, 1000].map((size) => <option key={size} value={size}>{size} / trang</option>)}
              </select></label>
              <button type="button" className="friends-page-button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Trước</button>
              <span className="friends-page-number">{currentPage} / {pageCount}</span>
              <button type="button" className="friends-page-button" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>Sau</button>
            </div>
          </div>
        </div>}
        <footer className="friends-footer">Đang đăng nhập: <strong>{activeAccount?.displayName ?? '—'}</strong><span>Danh sách được tải trực tiếp từ Zalo.</span></footer>
      </section>

      {confirmOpen && <Modal title="Xác nhận xóa bạn bè" role="alertdialog" closeDisabled={deleting} onClose={() => { if (!deleting) setConfirmOpen(false) }}>
        <div className="friends-confirm"><p>Bạn sắp xóa <strong>{selected.length} bạn bè</strong> của tài khoản <strong>{activeAccount?.displayName}</strong>. Danh sách dưới đây bắt đầu từ người kết bạn lâu nhất.</p>
          <ol>{selected.slice(0, 8).map((friend) => <li key={friend.id}><span>{friend.name}</span><small>{formatFriendDate(friend.createdAt)}</small></li>)}</ol>
          {selected.length > 8 && <p className="friends-confirm__more">và {selected.length - 8} người khác…</p>}
          <p className="friends-confirm__warning">Thao tác xóa bạn được thực hiện trên Zalo và không thể hoàn tác.</p>
          <div className="friends-confirm__actions"><button type="button" className="friends-button" disabled={deleting} onClick={() => setConfirmOpen(false)}>Hủy</button><button type="button" className="friends-button friends-button--danger" disabled={deleting} onClick={() => void removeSelected()}><FiTrash2 aria-hidden="true" />{deleting ? 'Đang xóa…' : `Xóa ${selected.length} bạn`}</button></div>
        </div>
      </Modal>}
    </div>
  )
}
