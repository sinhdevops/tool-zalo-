import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { AdvisorInput, Draft } from '../../../server/advisor/types'
import { apiUrl } from '../../api-url'
import './advisor-test.css'
type Message = AdvisorInput['messages'][number] & { imagePath?: string }
export default function AdvisorTestPage() {
  const [phase, setPhase] = useState<'new' | 'waiting' | 'active'>('new')
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [address, setAddress] = useState('')
  const [plan, setPlan] = useState('')
  const [service, setService] = useState<'internet' | 'internet-tv'>('internet')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Draft | null>(null)
  const [facts, setFacts] = useState<AdvisorInput['facts']>({ salutation: 'anh/chị' })
  const chatLog = useRef<HTMLDivElement>(null)
  useEffect(() => { if (chatLog.current) chatLog.current.scrollTop = chatLog.current.scrollHeight }, [messages, busy])
  async function send(submittedText = text, event: 'setup' | 'reply' | 'heart' | 'friend-accepted' = 'reply') {
    if (busy || !submittedText.trim()) return
    if (messages.length >= 96) { setError('Hãy bắt đầu cuộc test mới để tiếp tục.'); return }
    setBusy(true); setError('')
    const next = [...messages, { id: crypto.randomUUID(), role: 'customer' as const, text: submittedText.trim(), at: Date.now() }]
    try {
      const endpoint = import.meta.env.DEV ? '/api/advisor/test' : apiUrl('/api/advisor/test')
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Zalo-Tool': '1' }, signal: AbortSignal.timeout(20000), body: JSON.stringify({ outreach: { phase, event }, messages: next.map(({ id, role, text, at }) => ({ id, role, text, at })), facts: { ...facts, address: address || undefined, plan: plan || undefined, service } }) })
      if (!response.ok) { const failure = await response.json().catch(() => ({})); throw new Error(failure.error || `API test chưa sẵn sàng (${response.status}). Cần chạy backend bản mới.`) }
      const draft = await response.json() as Draft
      setResult(draft); setFacts(draft.facts); setAddress(draft.facts.address ?? ''); setPlan(draft.facts.plan ?? '')
      if (draft.outreachPhase) setPhase(draft.outreachPhase)
      const replies: Message[] = draft.outgoing ? draft.outgoing.map(item => ({ id: crypto.randomUUID(), role: 'bot' as const, text: item.kind === 'text' ? item.text : item.label, imagePath: item.kind === 'image' ? item.path : undefined, at: Date.now() })) : draft.reply ? [{ id: crypto.randomUUID(), role: 'bot', text: draft.reply, at: Date.now() }] : []
      setMessages([...next, ...replies])
      if (submittedText === text) setText('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không kết nối được API test.') }
    finally { setBusy(false) }
  }
  return <main className="advisor-test">
    <Link to="/automation">← Tự động hóa</Link>
    <header><div><h1>Test tư vấn</h1><p>Nhập vai khách để thử hội thoại. Chỉ mô phỏng, không gửi Zalo.</p></div><button disabled={busy} onClick={() => { setPhase('new'); setMessages([]); setFacts({ salutation: 'anh/chị' }); setResult(null); setText(''); setError(''); setAddress(''); setPlan(''); setService('internet') }}>Cuộc test mới</button></header>
    <p className="advisor-test-note">Dùng bảng giá từ ảnh bạn cung cấp và danh mục vùng nghiên cứu để thử. Đây là bộ quy tắc hiện tại, chưa kết nối AI.</p>
    <div className="advisor-test-layout"><section className="advisor-test-chat">
      <div ref={chatLog} className="advisor-test-messages" role="log" aria-label="Hội thoại thử">
        {!messages.length && <p>Thử: “Nhà em 3 tầng, tư vấn giúp em” hoặc “Có tặng camera không?”</p>}
        {messages.map(m => <article key={m.id} className={m.role}><strong>{m.role === 'customer' ? 'Khách (bạn nhập)' : 'Bot'}</strong><p>{m.text}</p>{m.imagePath && <img src={m.imagePath} alt={m.text} style={{ width: 300, maxWidth: '100%' }} />}</article>)}
        {busy && <p role="status">Đang soạn trả lời…</p>}
        {!busy && result && !result.reply && <p role="status">{result.action === 'handoff' ? 'Bot chưa hiểu đủ để trả lời câu này, cần bạn xử lý. Bạn có thể nhập rõ nhu cầu hoặc thử câu khác.' : result.action === 'wait' ? 'Đã gửi lời chào. Đang chờ khách trả lời, thả tim hoặc chấp nhận kết bạn.' : 'Bot tạm dừng hoặc tin này đã được xử lý.'}</p>}
      </div>
      {error && <p className="advisor-test-error" role="alert">{error}</p>}
      {phase === 'waiting' && <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><button disabled={busy} onClick={() => void send('❤️ Khách thả tim', 'heart')}>Giả lập thả tim</button><button disabled={busy} onClick={() => void send('Khách chấp nhận kết bạn', 'friend-accepted')}>Chấp nhận kết bạn</button></div>}
      <form onSubmit={e => { e.preventDefault(); void send() }}><label htmlFor="test-message">Tin nhắn khách</label><textarea id="test-message" value={text} maxLength={6000} disabled={busy} onChange={e => setText(e.target.value)} placeholder="Nhập tin nhắn như khách đang hỏi…" onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send() } }} /><div><small>Enter để gửi · Shift+Enter xuống dòng</small><button disabled={busy || !text.trim()}>{busy ? 'Đang xử lý…' : 'Gửi thử'}</button></div></form>
    </section><aside><h2>Thông tin test</h2><p>Điền thông tin rồi bấm gửi bên dưới. Có thể để trống để bot hỏi thêm.</p>
      <form onSubmit={e => { e.preventDefault(); void send([address.trim() ? `Địa chỉ lắp đặt: ${address.trim()}` : '', plan ? `Gói cước: ${plan}` : '', service === 'internet-tv' ? 'Tư vấn giúp mình Internet kèm tivi.' : 'Tư vấn giúp mình gói Internet phù hợp.'].filter(Boolean).join('\n'), 'setup') }}>
      <label>Địa chỉ<input value={address} maxLength={500} disabled={busy} onChange={e => setAddress(e.target.value)} placeholder="Q1, HCM hoặc Thừa Thiên Huế" /></label>
      <label>Gói khách đang chọn<select disabled={busy} value={plan} onChange={e => setPlan(e.target.value)}><option value="">Chưa chọn</option>{['NETVT1','NETVT2','MESHVT1','MESHVT2','MESHVT3'].map(p => <option key={p}>{p}</option>)}</select></label>
      <label>Dịch vụ<select value={service} disabled={busy} onChange={e => setService(e.target.value as typeof service)}><option value="internet">Internet</option><option value="internet-tv">Internet + TV</option></select></label>
      <button type="submit" disabled={busy} style={{ width: '100%', marginTop: 16 }}>{busy ? 'Đang xử lý…' : 'Gửi thông tin & tư vấn'}</button>
      </form>
      {result && <div className="advisor-test-result"><h2>Kết quả lượt gần nhất</h2><p><b>Xử lý:</b> {({ draft: 'Soạn nháp', handoff: 'Chuyển bạn xử lý', wait: 'Chờ thêm tin', skip: 'Không trả lời' })[result.action]}</p><p><b>Vùng:</b> {({ inner: 'Nội thành', outer: 'Ngoại thành', unknown: 'Chưa rõ' })[result.region.value]}</p>{result.recommendation?.plan && <p><b>Đề xuất:</b> {result.recommendation.plan}</p>}<p><b>Lý do:</b> {result.reasons.join(', ')}</p>{!!result.missing.length && <p><b>Còn thiếu:</b> {result.missing.join(', ')}</p>}</div>}
    </aside></div>
  </main>
}
