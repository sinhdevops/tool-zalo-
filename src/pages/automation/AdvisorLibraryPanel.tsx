import { useEffect, useState, type FormEvent } from 'react'
import { FiArchive, FiCheck, FiDownload, FiEdit2, FiPlus, FiSearch, FiUpload, FiX } from 'react-icons/fi'
import { advisorLibraryApi, type AdvisorLibraryEntry, type AdvisorLibraryStats } from './api'
import './advisor-library.css'

const emptyStats: AdvisorLibraryStats = { total: 0, answers: 0, examples: 0, needsReview: 0, testApproved: 0 }
const statusLabels: Record<AdvisorLibraryEntry['status'], string> = { review: 'Cần duyệt', 'test-approved': 'Dùng trong test', archived: 'Đã ẩn' }
const sourceLabels: Record<AdvisorLibraryEntry['source'], string> = { history: 'Chat lịch sử', correction: 'Bạn đã sửa', manual: 'Bạn tạo' }

function splitVariants(value: string) {
  return [...new Set(value.split(/[\n,;]+/u).map(item => item.trim()).filter(Boolean))].slice(0, 40)
}

export default function AdvisorLibraryPanel() {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [kind, setKind] = useState('all')
  const [items, setItems] = useState<Array<{ item: AdvisorLibraryEntry; score: number }>>([])
  const [stats, setStats] = useState(emptyStats)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<string>()
  const [title, setTitle] = useState('')
  const [intent, setIntent] = useState('')
  const [customerText, setCustomerText] = useState('')
  const [context, setContext] = useState('')
  const [answer, setAnswer] = useState('')
  const [variants, setVariants] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setBusy(true)
      setError('')
      void advisorLibraryApi.list(query, status, kind, controller.signal).then(result => {
        setItems(result.items); setStats(result.stats)
      }).catch(cause => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Không tải được thư viện tư vấn.')
      }).finally(() => { if (!controller.signal.aborted) setBusy(false) })
    }, query ? 220 : 0)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [query, status, kind])

  const filteredCount = items.length

  async function refresh() {
    const result = await advisorLibraryApi.list(query, status, kind)
    setItems(result.items); setStats(result.stats)
  }

  async function importHistory() {
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await advisorLibraryApi.importHistory()
      setNotice(`Đã nhập ${result.imported} mẫu; đã lọc một số dạng thông tin cá nhân phổ biến. Bỏ qua ${result.skipped} mẫu trống hoặc trùng.`)
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không nhập được dữ liệu phân tích.') }
    finally { setBusy(false) }
  }

  async function exportLibrary() {
    setBusy(true); setError('')
    try {
      const result = await advisorLibraryApi.export()
      const blob = new Blob([result.content], { type: 'application/x-ndjson;charset=utf-8' })
      const href = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = href; link.download = result.filename; link.click()
      URL.revokeObjectURL(href)
      setNotice(`Đã xuất ${result.stats.total} mục trong thư viện.`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không xuất được dữ liệu.') }
    finally { setBusy(false) }
  }

  async function saveAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      const data = { title, intent, customerText, context, answer, variants: splitVariants(variants) }
      if (editingId) await advisorLibraryApi.updateAnswer(editingId, data)
      else await advisorLibraryApi.answer(data)
      setTitle(''); setIntent(''); setCustomerText(''); setContext(''); setAnswer(''); setVariants('')
      setEditingId(undefined); setShowCreate(false); setNotice(editingId ? 'Đã cập nhật câu trả lời trong phòng test.' : 'Đã lưu câu trả lời và bật dùng trong phòng test.')
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không lưu được câu trả lời.') }
    finally { setBusy(false) }
  }

  async function setItemStatus(item: AdvisorLibraryEntry, next: AdvisorLibraryEntry['status']) {
    setBusy(true); setError(''); setNotice('')
    try { await advisorLibraryApi.status(item.id, next); await refresh() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không cập nhật được trạng thái.') }
    finally { setBusy(false) }
  }

  async function removeItem(item: AdvisorLibraryEntry) {
    if (!window.confirm(`Xóa vĩnh viễn mục “${item.title}” khỏi thư viện?`)) return
    setBusy(true); setError(''); setNotice('')
    try { await advisorLibraryApi.remove(item.id); setNotice('Đã xóa mục khỏi thư viện.'); await refresh() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không xóa được mục.') }
    finally { setBusy(false) }
  }

  function startAnswerFromExample(item: AdvisorLibraryEntry) {
    setEditingId(undefined)
    setTitle(item.title.replace(/^Lịch sử · /u, ''))
    setIntent(item.intent)
    setCustomerText(item.customerText)
    setContext(item.context)
    setAnswer(item.answer)
    setVariants(item.variants.join('\n'))
    setShowCreate(true)
    setNotice('Mẫu lịch sử được chép vào biểu mẫu. Hãy rà câu trả lời cũ và sửa nội dung trước khi lưu.')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function startEdit(item: AdvisorLibraryEntry) {
    setEditingId(item.id)
    setTitle(item.title); setIntent(item.intent); setCustomerText(item.customerText)
    setContext(item.context); setAnswer(item.answer); setVariants(item.variants.join('\n'))
    setShowCreate(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return <section className="advisor-library" aria-label="Thư viện tư vấn">
    <div className="advisor-library-intro">
      <div>
        <span className="advisor-library-eyebrow">DỮ LIỆU TƯ VẤN</span>
        <h2>Thư viện câu hỏi & bài học</h2>
        <p>Tìm câu hỏi không dấu, viết tắt hoặc gần giống. Mẫu chat cũ chỉ để tham khảo; hãy kiểm tra câu trả lời rồi tạo thành mục trả lời riêng trước khi dùng trong phòng test. Bộ lọc thông tin cá nhân chỉ nhận diện một số định dạng phổ biến.</p>
      </div>
      <div className="advisor-library-tools">
        <button type="button" className="advisor-library-secondary" disabled={busy} onClick={() => void importHistory()}><FiUpload /> Nhập mẫu đã phân tích</button>
        <button type="button" className="advisor-library-secondary" disabled={busy || !stats.total} onClick={() => void exportLibrary()}><FiDownload /> Xuất JSONL</button>
      <button type="button" className="advisor-library-primary" disabled={busy} onClick={() => { setEditingId(undefined); setTitle(''); setIntent(''); setCustomerText(''); setContext(''); setAnswer(''); setVariants(''); setShowCreate(value => !value) }}><FiPlus /> Thêm câu trả lời</button>
      </div>
    </div>

    <div className="advisor-library-stats" aria-label="Thống kê thư viện">
      <div><span>Tổng mục</span><strong>{stats.total}</strong></div>
      <div><span>Câu trả lời</span><strong>{stats.answers}</strong></div>
      <div><span>Mẫu lịch sử</span><strong>{stats.examples}</strong></div>
      <div><span>Cần duyệt</span><strong>{stats.needsReview}</strong></div>
      <div><span>Dùng trong test</span><strong>{stats.testApproved}</strong></div>
    </div>

    {showCreate && <form className="advisor-library-create" onSubmit={saveAnswer}>
      <div className="advisor-library-create-heading"><div><h3>{editingId ? 'Sửa câu trả lời' : 'Tạo câu trả lời cho phòng test'}</h3><p>Chỉ đưa vào kết quả test khi câu khách và ý định khớp rõ.</p></div><button type="button" aria-label="Đóng biểu mẫu" onClick={() => { setShowCreate(false); setEditingId(undefined) }}><FiX /></button></div>
      <div className="advisor-library-form-grid">
        <label>Tiêu đề<input required maxLength={160} value={title} onChange={event => setTitle(event.target.value)} placeholder="Ví dụ: Thời gian lắp đặt" /></label>
        <label>Ý định (tùy chọn)<input maxLength={100} value={intent} onChange={event => setIntent(event.target.value)} placeholder="Ví dụ: schedule" /></label>
        <label className="wide">Cách khách thường hỏi<textarea required maxLength={6000} value={customerText} onChange={event => setCustomerText(event.target.value)} placeholder="Nhập một câu hỏi đại diện" /></label>
        <label className="wide">Câu hỏi trước đó (nếu câu khách phụ thuộc ngữ cảnh)<textarea maxLength={3000} value={context} onChange={event => setContext(event.target.value)} placeholder="Ví dụ: Nhà mình cần phủ Wi-Fi mấy tầng ạ?" /></label>
        <label className="wide">Cách trả lời bạn đã duyệt<textarea required maxLength={3000} value={answer} onChange={event => setAnswer(event.target.value)} placeholder="Nội dung câu trả lời được phép dùng trong phòng test" /></label>
        <label className="wide">Các cách hỏi tương tự, mỗi dòng một cách<textarea value={variants} onChange={event => setVariants(event.target.value)} placeholder={'lap lau khong\nlắp mạng mất bao lâu'} /></label>
      </div>
      <div className="advisor-library-form-actions"><span>Lưu trong thư viện tư vấn cục bộ; chưa bật gửi tự động cho khách.</span><div>{editingId && <button type="button" disabled={busy} onClick={() => { setShowCreate(false); setEditingId(undefined) }}>Hủy sửa</button>}<button className="advisor-library-primary" disabled={busy}>{editingId ? 'Cập nhật câu trả lời' : 'Lưu câu trả lời'}</button></div></div>
    </form>}

    {notice && <p className="advisor-library-notice" role="status"><FiCheck /> {notice}</p>}
    {error && <p className="advisor-library-error" role="alert">{error}</p>}

    <div className="advisor-library-search-row">
      <label className="advisor-library-search"><FiSearch aria-hidden="true" /><span className="sr-only">Tìm trong thư viện</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm ý khách, câu trả lời, viết tắt…" /></label>
      <label className="advisor-library-filter"><span>Trạng thái</span><select value={status} onChange={event => setStatus(event.target.value)}><option value="all">Tất cả</option><option value="review">Cần duyệt</option><option value="test-approved">Dùng trong test</option><option value="archived">Đã ẩn</option></select></label>
      <label className="advisor-library-filter"><span>Loại</span><select value={kind} onChange={event => setKind(event.target.value)}><option value="all">Tất cả</option><option value="answer">Câu trả lời</option><option value="example">Mẫu lịch sử</option></select></label>
    </div>

    <div className="advisor-library-results-heading"><h3>{query ? `Kết quả tìm kiếm (${filteredCount})` : `Các mục gần đây (${filteredCount})`}</h3>{busy && <span>Đang xử lý…</span>}</div>
    {!busy && !items.length && <div className="advisor-library-empty"><FiSearch /><strong>{query ? 'Chưa tìm thấy mục phù hợp' : 'Thư viện chưa có dữ liệu'}</strong><span>Nhập mẫu lịch sử đã phân tích hoặc thêm câu trả lời đầu tiên.</span></div>}
    <div className="advisor-library-list">
      {items.map(({ item, score }) => <article className="advisor-library-card" key={item.id}>
        <div className="advisor-library-card-top">
          <div><span className={`advisor-library-badge ${item.status}`}>{item.kind === 'example' && item.status === 'test-approved' ? 'Mẫu tham khảo' : statusLabels[item.status]}</span><span className="advisor-library-badge source">{sourceLabels[item.source]}</span><span className="advisor-library-kind">{item.kind === 'answer' ? 'Câu trả lời' : 'Mẫu hội thoại'}</span></div>
          <div className="advisor-library-card-actions">
            {item.kind === 'example' && <button type="button" title="Chép mẫu vào biểu mẫu câu trả lời" disabled={busy} onClick={() => startAnswerFromExample(item)}><FiPlus /> Tạo câu trả lời</button>}
            {item.kind === 'answer' && <button type="button" title="Sửa câu trả lời" disabled={busy} onClick={() => startEdit(item)}><FiEdit2 /> Sửa</button>}
            {item.kind === 'answer' && item.status === 'review' && <button type="button" title="Duyệt để dùng trong test" disabled={busy} onClick={() => void setItemStatus(item, 'test-approved')}><FiCheck /> Duyệt cho test</button>}
            {item.status === 'test-approved' && <button type="button" title="Chuyển về trạng thái cần duyệt" disabled={busy} onClick={() => void setItemStatus(item, 'review')}><FiArchive /> Cần duyệt</button>}
            {item.status !== 'archived' ? <button type="button" title="Ẩn mục" disabled={busy} onClick={() => void setItemStatus(item, 'archived')}><FiArchive /> Ẩn</button> : <button type="button" disabled={busy} onClick={() => void setItemStatus(item, 'review')}>Khôi phục</button>}
            <button type="button" className="danger" title="Xóa mục" disabled={busy} onClick={() => void removeItem(item)}><FiX /> Xóa</button>
          </div>
        </div>
        <h4>{item.title}</h4>
        <div className="advisor-library-card-grid">
          <div><span>Khách hỏi</span><p>{item.customerText}</p></div>
          {item.context && <div><span>Ngữ cảnh trước đó</span><p>{item.context}</p></div>}
          {item.draftReply && <div><span>Bot đã trả lời</span><p>{item.draftReply}</p></div>}
          {item.answer && <div className="approved-answer"><span>{item.source === 'correction' ? 'Câu bạn đã sửa' : 'Câu trả lời lưu'}</span><p>{item.answer}</p></div>}
        </div>
        {!!item.variants.length && <div className="advisor-library-variants"><span>Cách hỏi tương tự</span><div>{item.variants.map(variant => <span key={variant}>{variant}</span>)}</div></div>}
        <footer><span>Ý định: {item.intent || 'chưa gắn nhãn'}</span><span>Nguồn: {sourceLabels[item.source]}</span>{query && score > 0 && <span>Độ gần câu chữ: {Math.round(score * 100)}%</span>}</footer>
      </article>)}
    </div>
  </section>
}
