import { useEffect, useState } from 'react'
import type { Account } from '../../../shared/accounts'
import type { AutomationRule, GroupMember } from '../../../shared/automation'
import { automationSenderIds } from '../../../shared/automation'
import type { Conversation } from '../../../shared/messages'
import { automationApi } from './api'
import { Dropdown, Modal } from '../../components/common'
import SenderSelect from './SenderSelect'
const simple = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ')
export default function RuleForm({ rule, accounts, onClose, onSaved }: { rule: AutomationRule | null; accounts: Account[]; onClose: () => void; onSaved: () => void }) {
  const [accountId, setAccount] = useState(rule?.accountId ?? accounts.find((a) => a.status === 'connected')?.id ?? '')
  const [groupId, setGroup] = useState(rule?.groupId ?? ''), [senderIds, setSenders] = useState<string[]>(rule ? automationSenderIds(rule) : []), [targetGroupId, setTargetGroup] = useState(rule?.targetGroupId ?? '')
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
      const available = list.filter(member => member.id !== accountId)
      setMembers(available)
      setSenders(current => {
        const valid = current.filter(id => available.some(member => member.id === id))
        const suggested = available.find(member => simple(member.name).startsWith('wifi truyen hinh camera'))
        return valid.length ? valid : suggested ? [suggested.id] : []
      })
      setError('')
    }).catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Không tải được thành viên.') })
    return () => controller.abort()
  }, [accountId, groupId])
  async function save() {
    setBusy(true); setError('')
    try { await automationApi.configure(accountId, groupId, senderIds, targetGroupId, rule?.id ?? null); onSaved() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Chưa lưu được cấu hình.') }
    finally { setBusy(false) }
  }
  return <Modal title={rule ? "Chỉnh sửa nhận nhóm" : "Tạo nhận nhóm mới"} onClose={onClose} closeDisabled={busy}><form className="auto-form" onSubmit={(e) => { e.preventDefault(); void save() }}>
    <p>Chọn đúng nguồn nhận lead. Sau khi lưu, bạn bật quy tắc tại mục nhận nhóm tương ứng.</p>
    <Dropdown<string> label="Tài khoản trực" required value={accountId} disabled={busy} placeholder="Chọn tài khoản" options={accounts.map((a) => ({ value: a.id, label: `${a.displayName} · ${a.id}`, disabled: a.status !== 'connected' }))} onChange={(value) => { setAccount(value); setGroup(''); setSenders([]); setTargetGroup(''); setGroups([]); setMembers([]) }} />
    <Dropdown<string> label="Nhóm theo dõi" required value={groupId} disabled={busy || !groups.length} placeholder={accountId && !groups.length ? 'Đang tải nhóm…' : 'Chọn nhóm'} options={groups.map((g) => ({ value: g.id, label: g.name }))} onChange={(value) => { setGroup(value); setSenders([]); setMembers([]) }} />
    <SenderSelect value={senderIds} disabled={busy || !members.length} placeholder={groupId && !members.length ? 'Chưa có thành viên để chọn' : 'Chọn người gửi'} members={members} onChange={setSenders} />
    <Dropdown<string> label="Nhóm nhận số" required value={targetGroupId} disabled={busy || !groups.length} placeholder="Chọn nhóm nhận" options={groups.filter((g) => g.id !== groupId).map((g) => ({ value: g.id, label: g.name }))} onChange={setTargetGroup} />
    <div className="auto-note">Tin mới có số điện thoại → lưu lead → chờ ngẫu nhiên 10–15 giây → thả ❤️ → gửi nguyên nội dung tin sang nhóm nhận. Danh thiếp được lấy từ tin nguồn hoặc tra bằng số Zalo rồi gửi ngay sau đó.</div>
    {error && <p className="auto-error" role="alert">{error}</p>}
    <div className="auto-actions"><button type="button" className="auto-button" disabled={busy} onClick={onClose}>Hủy</button><button className="auto-button primary" disabled={busy || !groupId || !targetGroupId || !senderIds.length || !senderIds.every(id => members.some(member => member.id === id))}>{busy ? 'Đang lưu…' : 'Lưu cấu hình'}</button></div>
  </form></Modal>
}
