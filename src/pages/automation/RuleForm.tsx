import { useEffect, useState } from 'react'
import type { Account } from '../../../shared/accounts'
import type { AutomationRule, GroupMember } from '../../../shared/automation'
import type { Conversation } from '../../../shared/messages'
import { automationApi } from './api'
import { Dropdown, Modal } from '../../components/common'
const simple = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ')
export default function RuleForm({ rule, accounts, onClose, onSaved }: { rule: AutomationRule | null; accounts: Account[]; onClose: () => void; onSaved: () => void }) {
  const [accountId, setAccount] = useState(rule?.accountId ?? accounts.find((a) => a.status === 'connected')?.id ?? '')
  const [groupId, setGroup] = useState(rule?.groupId ?? ''), [senderId, setSender] = useState(rule?.senderId ?? ''), [targetGroupId, setTargetGroup] = useState(rule?.targetGroupId ?? '')
  const [groups, setGroups] = useState<Conversation[]>([]), [members, setMembers] = useState<GroupMember[]>([])
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!accountId) return
    const controller = new AbortController()
    void automationApi.groups(accountId, controller.signal).then(({ groups: list }) => {
      if (controller.signal.aborted) return
      setGroups(list)
      setGroup((current) => list.some((g) => g.id === current) ? current : list.find((g) => simple(g.name).startsWith('tra xinh tv viettel'))?.id ?? '')
      setTargetGroup((current) => list.some((g) => g.id === current) ? current : list.find((g) => simple(g.name) === 'nhan so vt')?.id ?? '')
      setError('')
    }).catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Không tải được nhóm.') })
    return () => controller.abort()
  }, [accountId])
  useEffect(() => {
    if (!accountId || !groupId) return
    const controller = new AbortController()
    void automationApi.members(accountId, groupId, controller.signal).then(({ members: list }) => {
      if (controller.signal.aborted) return
      setMembers(list); setSender((current) => list.some((m) => m.id === current) ? current : list.find((m) => simple(m.name).startsWith('wifi truyen hinh camera'))?.id ?? ''); setError('')
    }).catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Không tải được thành viên.') })
    return () => controller.abort()
  }, [accountId, groupId])
  async function save() {
    setBusy(true); setError('')
    try { await automationApi.configure(accountId, groupId, senderId, targetGroupId); onSaved() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Chưa lưu được cấu hình.') }
    finally { setBusy(false) }
  }
  return <Modal title="Cấu hình trực nhóm" onClose={onClose} closeDisabled={busy}><form className="auto-form" onSubmit={(e) => { e.preventDefault(); void save() }}>
    <p>Chọn đúng nguồn nhận lead. Sau khi lưu, bạn bật quy tắc tại card tính năng.</p>
    <Dropdown<string> label="Tài khoản trực" required value={accountId} disabled={busy} placeholder="Chọn tài khoản" options={accounts.map((a) => ({ value: a.id, label: `${a.displayName} · ${a.id}`, disabled: a.status !== 'connected' }))} onChange={(value) => { setAccount(value); setGroup(''); setSender(''); setTargetGroup(''); setGroups([]); setMembers([]) }} />
    <Dropdown<string> label="Nhóm theo dõi" required value={groupId} disabled={busy || !groups.length} placeholder={accountId && !groups.length ? 'Đang tải nhóm…' : 'Chọn nhóm'} options={groups.map((g) => ({ value: g.id, label: g.name }))} onChange={(value) => { setGroup(value); setSender(''); setMembers([]) }} />
    <Dropdown<string> label="Chỉ nhận tin từ" required value={senderId} disabled={busy || !members.length} placeholder={groupId && !members.length ? 'Đang tải thành viên…' : 'Chọn người gửi'} options={members.filter((m) => m.id !== accountId).map((m) => ({ value: m.id, label: `${m.name} · ${m.id}` }))} onChange={setSender} />
    <Dropdown<string> label="Nhóm nhận số" required value={targetGroupId} disabled={busy || !groups.length} placeholder="Chọn nhóm nhận" options={groups.filter((g) => g.id !== groupId).map((g) => ({ value: g.id, label: g.name }))} onChange={setTargetGroup} />
    <div className="auto-note">Tin mới có số điện thoại → lưu lead → chờ ngẫu nhiên 10–15 giây → thả ❤️ → gửi nguyên nội dung tin sang nhóm nhận. Danh thiếp được lấy từ tin nguồn hoặc tra bằng số Zalo rồi gửi ngay sau đó.</div>
    {error && <p className="auto-error" role="alert">{error}</p>}
    <div className="auto-actions"><button type="button" className="auto-button" disabled={busy} onClick={onClose}>Hủy</button><button className="auto-button primary" disabled={busy || !groupId || !targetGroupId || !senderId || !members.some((m) => m.id === senderId)}>{busy ? 'Đang lưu…' : 'Lưu cấu hình'}</button></div>
  </form></Modal>
}
