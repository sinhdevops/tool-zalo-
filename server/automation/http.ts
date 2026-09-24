import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AutomationService } from './service.ts'
import { ChatError } from '../messages/types.ts'
import { LEAD_STAGES } from '../../shared/automation.ts'
import type { LeadStage } from '../../shared/automation.ts'
import { phones } from './parse.ts'
import { AutomationStore } from './store.ts'

async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []; let size = 0
  for await (const chunk of request) { const bytes = Buffer.from(chunk); size += bytes.length; if (size > 128 * 1024) throw new ChatError('Yêu cầu quá lớn.', 413); chunks.push(bytes) }
  try { const value: unknown = JSON.parse(Buffer.concat(chunks).toString()); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value as Record<string, unknown> } catch { throw new ChatError('Nội dung yêu cầu không hợp lệ.') }
}
export async function handleAutomation(request: IncomingMessage, response: ServerResponse, url: URL, service: AutomationService, json: (response: ServerResponse, status: number, value: unknown) => void) {
  if (!url.pathname.startsWith('/api/automation/') && url.pathname !== '/api/leads' && !url.pathname.startsWith('/api/leads/')) return false
  const action = url.pathname, method = request.method
  if (action.startsWith('/api/leads/') && method === 'GET') {
    const lead = service.store.lead(decodeURIComponent(action.slice('/api/leads/'.length)))
    if (!lead) throw new ChatError('Không tìm thấy lead.', 404)
    json(response, 200, lead)
  } else if (action.startsWith('/api/leads/') && method === 'POST') {
    const id = decodeURIComponent(action.slice('/api/leads/'.length)), data = await body(request)
    if (typeof data.updatedAt !== 'number' || typeof data.name !== 'string' || typeof data.phone !== 'string' || typeof data.address !== 'string' || typeof data.plan !== 'string' || typeof data.stage !== 'string' || !LEAD_STAGES.includes(data.stage as LeadStage)) throw new ChatError('Thông tin lead không hợp lệ.')
    const phone = phones(data.phone)
    if (phone.length !== 1 || data.name.trim().length > 120 || data.address.trim().length > 500 || data.plan.trim().length > 120) throw new ChatError('Kiểm tra lại tên, số điện thoại, địa chỉ và gói cước.')
    try { json(response, 200, service.store.editLead(id, data.updatedAt, { name: data.name.trim(), phone: phone[0]!, address: data.address.trim(), plan: data.plan.trim(), stage: data.stage as LeadStage })) }
    catch (cause) {
      if (cause instanceof Error && cause.message === 'LEAD_NOT_FOUND') throw new ChatError('Không tìm thấy lead.', 404)
      if (cause instanceof Error && cause.message === 'LEAD_CHANGED') throw new ChatError('Lead vừa được cập nhật. Hãy tải lại trước khi sửa.', 409)
      if (cause instanceof Error && cause.message === 'LEAD_PHONE_EXISTS') throw new ChatError('Số điện thoại này đã có trong một lead cùng nguồn.', 409)
      throw cause
    }
  }
  else if (action === '/api/automation/state' && method === 'GET') json(response, 200, service.snapshot())
  else if (action === '/api/automation/bulk' && method === 'GET') json(response, 200, service.bulkSnapshot())
  else if (action === '/api/automation/bulk/create' && method === 'POST') {
    const data = await body(request)
    if (typeof data.accountId !== 'string' || typeof data.message !== 'string' || typeof data.phones !== 'string' || typeof data.startTime !== 'string' || typeof data.endTime !== 'string' || typeof data.delaySeconds !== 'number') throw new ChatError('Cấu hình gửi hàng loạt không hợp lệ.')
    json(response, 200, service.createBulk({ accountId: data.accountId, message: data.message, startTime: data.startTime, endTime: data.endTime, delaySeconds: data.delaySeconds, pauseEvery: 2, pauseSeconds: 60 }, data.phones.split(/\r?\n/)))
  }
  else if (action === '/api/automation/bulk/start' && method === 'POST') {
    const data = await body(request)
    if (typeof data.id !== 'string') throw new ChatError('Thiếu mã cấu hình gửi tin.')
    json(response, 200, service.startBulk(data.id))
  }
  else if (action === '/api/automation/bulk/stop' && method === 'POST') {
    const data = await body(request)
    json(response, 200, service.stopBulk(typeof data.id === 'string' ? data.id : undefined))
  }
  else if (action === '/api/automation/logs' && method === 'GET') json(response, 200, { logs: service.store.logs(), limit: AutomationStore.LOG_LIMIT })
  else if (action === '/api/automation/choices' && method === 'GET') json(response, 200, await service.choices(url.searchParams.get('accountId') ?? '', url.searchParams.get('groupId') || undefined))
  else if (action === '/api/automation/rule' && method === 'POST') {
    const data = await body(request)
    if (typeof data.accountId !== 'string' || typeof data.groupId !== 'string' || typeof data.senderId !== 'string' || typeof data.targetGroupId !== 'string') throw new ChatError('Cấu hình không hợp lệ.')
    json(response, 200, await service.configure(data.accountId, data.groupId, data.senderId, data.targetGroupId, data.id === null ? null : typeof data.id === 'string' ? data.id : undefined))
  } else if (action === '/api/automation/enabled' && method === 'POST') {
    const data = await body(request)
    if (typeof data.enabled !== 'boolean') throw new ChatError('Trạng thái bật/tắt không hợp lệ.')
    json(response, 200, await service.toggle(data.enabled, typeof data.id === 'string' ? data.id : undefined))
  } else if (action === '/api/leads' && method === 'GET') {
    const page = Number(url.searchParams.get('page') ?? 1), stage = url.searchParams.get('stage') ?? '', search = url.searchParams.get('search') ?? ''
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || search.length > 200 || (stage && !LEAD_STAGES.includes(stage as LeadStage))) throw new ChatError('Bộ lọc không hợp lệ.')
    json(response, 200, service.store.leads(search, stage, page))
  } else throw new ChatError('Không hỗ trợ yêu cầu tự động hóa này.', 405)
  return true
}
