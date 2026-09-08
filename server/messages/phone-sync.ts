import { createDecipheriv, createHash, constants, generateKeyPairSync, privateDecrypt, webcrypto } from 'node:crypto'
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { decompress, initWasm } from 'lzma-wasm'
import { inflate } from 'pako'
import type { API } from 'zalo-api-final'
import type { PhoneSyncState } from '../../shared/messages.ts'

type SyncInfo = {
  url: string; encrypted_key: string; file_name: string; file_size: number
  checksum_code: string; from_seq_id: number; is_full_transfer: number
  db_info?: string | { backup_db?: { msg_total?: number; msg_thread?: number } }
}
type CustomContext = {
  ctx: { imei: string; cookie?: { getCookieString(url: string): Promise<string> }; userAgent?: string }
  utils: {
    makeURL(base: string, params?: Record<string, string | number>, apiVersion?: boolean): string
    encodeAES(value: string): string | undefined
    request(url: string, options?: RequestInit, raw?: boolean): Promise<Response>
    resolve(response: Response): Promise<unknown>
  }
  props: { publicKey: string }
}
type ListenerInternals = { ws?: { on(event: 'message', handler: (data: Buffer) => void): void; off(event: 'message', handler: (data: Buffer) => void): void }; cipherKey?: string }

const MAX_BACKUP_BYTES = 2 * 1024 * 1024 * 1024
const SYNC_TIMEOUT = 10 * 60_000

function text(value: unknown) { return typeof value === 'string' ? value : '' }

async function decodeSocketPacket(data: Buffer, cipherKey?: string): Promise<Record<string, unknown> | undefined> {
  if (data.length < 5 || data[0] !== 1 || data.readUInt16LE(1) !== 601 || data[3] !== 0) return
  const parsed = JSON.parse(data.subarray(4).toString('utf8')) as { data?: unknown; encrypt?: unknown }
  if (typeof parsed.data !== 'string' || typeof parsed.encrypt !== 'number') return
  if (parsed.encrypt === 0) return JSON.parse(parsed.data) as Record<string, unknown>
  let bytes = Buffer.from(parsed.encrypt === 1 ? parsed.data : decodeURIComponent(parsed.data), 'base64')
  if (parsed.encrypt !== 1) {
    if (!cipherKey || bytes.length < 48) return
    const key = await webcrypto.subtle.importKey('raw', Buffer.from(cipherKey, 'base64'), 'AES-GCM', false, ['decrypt'])
    bytes = Buffer.from(await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 16), additionalData: bytes.subarray(16, 32), tagLength: 128 }, key, bytes.subarray(32)))
  }
  if (parsed.encrypt !== 3) bytes = Buffer.from(inflate(bytes))
  return JSON.parse(bytes.toString('utf8')) as Record<string, unknown>
}

function decryptChunks(ciphertext: Buffer, key: Buffer) {
  const chunks: Buffer[] = []
  for (let offset = 0; offset < ciphertext.length; offset += 65_536) {
    const decipher = createDecipheriv('aes-256-cbc', key, Buffer.alloc(16))
    decipher.setAutoPadding(false)
    chunks.push(decipher.update(ciphertext.subarray(offset, Math.min(offset + 65_536, ciphertext.length))), decipher.final())
  }
  return Buffer.concat(chunks)
}

function candidateKeys(raw: Buffer) {
  const values = [raw, Buffer.from(raw.toString('hex').toUpperCase().slice(0, 32), 'ascii'), Buffer.from(raw.toString('base64').toUpperCase().slice(0, 32), 'ascii')]
  return values.filter((value, index) => value.length === 32 && values.findIndex((item) => item.equals(value)) === index)
}

export async function extractZaloBackup(ciphertext: Buffer, rsaPrivateKey: string, encryptedKey: string, output: string) {
  if (ciphertext.length < 16 || ciphertext.length > MAX_BACKUP_BYTES) throw new Error('Kích thước backup Zalo không hợp lệ.')
  const rawKey = privateDecrypt({ key: rsaPrivateKey, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(encryptedKey, 'base64'))
  const spans: Buffer[] = []
  if (ciphertext.length % 16 === 0) spans.push(ciphertext)
  if (ciphertext.length > 4 && (ciphertext.length - 4) % 16 === 0) spans.push(ciphertext.subarray(4), ciphertext.subarray(0, -4))
  let plain: Buffer | undefined
  for (const span of spans) for (const key of candidateKeys(rawKey)) {
    try { const value = decryptChunks(span, key); if (value.subarray(0, 6).toString() === 'ZDB4.0') { plain = value; break } } catch { /* try the next observed layout */ }
    if (plain) break
  }
  if (!plain) throw new Error('Không giải mã được backup Zalo (sai định dạng hoặc Zalo đã đổi khóa).')
  let offset = 14
  if (plain.length < offset + 4) throw new Error('Backup Zalo bị thiếu bảng tệp.')
  const count = plain.readUInt32BE(offset); offset += 4
  if (count > 100_000) throw new Error('Backup Zalo có số lượng tệp bất thường.')
  const files: Array<{ name: string; size: number }> = []
  for (let index = 0; index < count; index++) {
    if (offset + 4 > plain.length) throw new Error('Backup Zalo bị cắt giữa chừng.')
    const length = plain.readUInt32BE(offset); offset += 4
    if (length > 4096 || offset + length + 4 > plain.length) throw new Error('Tên tệp trong backup không hợp lệ.')
    const name = plain.subarray(offset, offset + length).toString('utf8').replaceAll('\\', '/'); offset += length
    const size = plain.readUInt32BE(offset); offset += 4
    if (!name || path.posix.isAbsolute(name) || name.split('/').includes('..')) throw new Error('Backup chứa đường dẫn không an toàn.')
    files.push({ name, size })
  }
  const expected = files.reduce((sum, item) => sum + item.size, 0)
  if (expected > MAX_BACKUP_BYTES) throw new Error('Dữ liệu giải nén vượt quá giới hạn 2 GB.')
  await initWasm()
  const expanded = Buffer.from(decompress(plain.subarray(offset), { expectedSize: expected, memLimit: MAX_BACKUP_BYTES }))
  if (expanded.length < expected) throw new Error('Dữ liệu giải nén không đầy đủ.')
  await mkdir(output, { recursive: true })
  let position = 0
  for (const file of files) {
    const destination = path.join(output, ...file.name.split('/'))
    await mkdir(path.dirname(destination), { recursive: true })
    await writeFile(destination, expanded.subarray(position, position + file.size), { mode: 0o600 })
    position += file.size
  }
  return files.map((file) => path.join(output, ...file.name.split('/')))
}

export class PhoneSyncController {
  private api: API
  private ownId: string
  private importBackup: (files: string[]) => Promise<{ messages: number; conversations: number }>
  private state: PhoneSyncState = { status: 'idle', reason: 'Sẵn sàng gửi yêu cầu đồng bộ tới điện thoại.', updatedAt: Date.now() }
  private privateKey?: string
  private timer?: ReturnType<typeof setTimeout>
  private rawHandler = (data: Buffer) => { void this.receive(data) }
  private hooked?: ListenerInternals['ws']
  private custom?: CustomContext
  private available = false

  constructor(api: API, ownId: string, importBackup: (files: string[]) => Promise<{ messages: number; conversations: number }>) {
    this.api = api; this.ownId = ownId; this.importBackup = importBackup
    if (typeof api.custom !== 'function') {
      this.state = { status: 'error', reason: 'SDK Zalo hiện tại không có cổng gửi yêu cầu đồng bộ.', updatedAt: Date.now() }
      return
    }
    this.available = true
    api.custom<unknown, { publicKey: string }>('__phoneSyncPull', async (value) => {
      const input = value as unknown as CustomContext
      this.custom = input
      const encoded = input.utils.encodeAES(JSON.stringify({ pc_name: 'Web', public_key: input.props.publicKey, from_seq_id: 0, is_retry: 0, min_seq_id: 0, temp_key: '', imei: input.ctx.imei }))
      if (!encoded) throw new Error('Không mã hóa được yêu cầu đồng bộ.')
      const base = `${this.api.zpwServiceMap.file[0]}/api/message/pull_mobile_msg`
      const url = input.utils.makeURL(base, { zpw_ver: this.api.getContext().API_VERSION, zpw_type: this.api.getContext().API_TYPE, params: encoded, nretry: 0 }, false)
      return input.utils.resolve(await input.utils.request(url, { method: 'GET' }))
    })
    api.listener.on('cipher_key', () => this.hook())
    this.hook()
  }

  status() { return this.state }

  async request(): Promise<PhoneSyncState> {
    if (!this.available) throw new Error(this.state.reason)
    if (['requesting', 'awaiting_confirmation', 'downloading', 'decrypting', 'importing'].includes(this.state.status)) return this.state
    this.hook()
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } })
    this.privateKey = privateKey
    const publicKeyBase64 = publicKey.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, '')
    this.state = { status: 'requesting', reason: 'Đang gửi yêu cầu tới điện thoại…', updatedAt: Date.now() }
    try {
      await (this.api as API & { __phoneSyncPull(value: { publicKey: string }): Promise<unknown> }).__phoneSyncPull({ publicKey: publicKeyBase64 })
      this.state = { status: 'awaiting_confirmation', reason: 'Mở Zalo trên điện thoại và bấm “Đồng bộ ngay”.', updatedAt: Date.now() }
      clearTimeout(this.timer)
      this.timer = setTimeout(() => this.fail('Yêu cầu đã hết hạn. Hãy gửi lại yêu cầu mới.'), SYNC_TIMEOUT)
      this.timer.unref()
    } catch (error) { this.fail(error instanceof Error ? error.message : 'Không gửi được yêu cầu đồng bộ.') }
    return this.state
  }

  dispose() { clearTimeout(this.timer); if (this.hooked) this.hooked.off('message', this.rawHandler) }

  private hook() {
    const ws = (this.api.listener as unknown as ListenerInternals).ws
    if (!ws || ws === this.hooked) return
    if (this.hooked) this.hooked.off('message', this.rawHandler)
    ws.on('message', this.rawHandler); this.hooked = ws
  }

  private fail(reason: string) { clearTimeout(this.timer); this.privateKey = undefined; this.state = { status: 'error', reason, updatedAt: Date.now() } }

  private async receive(data: Buffer) {
    try {
      const listener = this.api.listener as unknown as ListenerInternals
      const decoded = await decodeSocketPacket(data, listener.cipherKey)
      const controls = Array.isArray(decoded?.controls) ? decoded.controls : []
      for (const item of controls) {
        if (!item || typeof item !== 'object') continue
        const content = (item as { content?: unknown }).content
        if (!content || typeof content !== 'object' || (content as { act_type?: unknown }).act_type !== 'syncmsgmb') continue
        const act = text((content as { act?: unknown }).act)
        const raw = (content as { data?: unknown }).data
        const detail = typeof raw === 'string' ? JSON.parse(raw) : raw
        if (act === 'transfer_error') { this.fail(text((detail as { error_msg?: unknown })?.error_msg) || 'Điện thoại báo lỗi khi tạo backup.'); continue }
        if (act === 'user_confirm') {
          const accepted = Number((detail as { user_action?: unknown })?.user_action)
          if (accepted === 0) this.fail('Bạn đã từ chối đồng bộ trên điện thoại.')
          else this.state = { status: 'downloading', reason: 'Điện thoại đã xác nhận. Đang chờ Zalo tạo backup…', updatedAt: Date.now() }
          continue
        }
        if (act === 'syncmsg_info' && detail && typeof detail === 'object') await this.process(detail as SyncInfo)
      }
    } catch (error) { if (this.privateKey) this.fail(error instanceof Error ? error.message : 'Không đọc được phản hồi đồng bộ.') }
  }

  private async process(info: SyncInfo) {
    if (!this.privateKey || !this.custom || !/^https:\/\//.test(info.url)) return
    const size = Number(info.file_size)
    if (!Number.isSafeInteger(size) || size < 1 || size > MAX_BACKUP_BYTES) return this.fail('Kích thước backup Zalo không hợp lệ.')
    clearTimeout(this.timer)
    this.state = { status: 'downloading', reason: 'Đang tải backup đã mã hóa từ Zalo…', progress: 25, updatedAt: Date.now() }
    const cookie = await this.custom.ctx.cookie?.getCookieString('https://chat.zalo.me/')
    const response = await fetch(info.url, { headers: { cookie: cookie ?? '', 'user-agent': this.custom.ctx.userAgent ?? '' } })
    if (!response.ok) throw new Error(`Không tải được backup (HTTP ${response.status}).`)
    const backup = Buffer.from(await response.arrayBuffer())
    if (backup.length > MAX_BACKUP_BYTES) throw new Error('Backup vượt quá giới hạn 2 GB.')
    const root = path.resolve('.data', 'phone-sync', createHash('sha256').update(this.ownId).digest('hex'))
    await mkdir(root, { recursive: true })
    const pending = path.join(root, 'latest.db.crypt.pending')
    const saved = path.join(root, 'latest.db.crypt')
    await writeFile(pending, backup, { mode: 0o600 }); await rm(saved, { force: true }); await rename(pending, saved)
    this.state = { status: 'decrypting', reason: 'Đã tải backup. Đang giải mã và kiểm tra dữ liệu…', progress: 55, updatedAt: Date.now() }
    const temporary = await mkdtemp(path.join(tmpdir(), 'zalo-phone-sync-'))
    try {
      const files = await extractZaloBackup(backup, this.privateKey, info.encrypted_key, temporary)
      this.state = { status: 'importing', reason: 'Đang nhập lịch sử vào kho trò chuyện đã mã hóa…', progress: 80, updatedAt: Date.now() }
      const imported = await this.importBackup(files)
      this.state = { status: 'completed', reason: `Đã đồng bộ ${imported.messages.toLocaleString('vi-VN')} tin nhắn trong ${imported.conversations.toLocaleString('vi-VN')} cuộc trò chuyện.`, progress: 100, importedMessages: imported.messages, importedConversations: imported.conversations, backupMessages: typeof info.db_info === 'object' ? info.db_info.backup_db?.msg_total : undefined, updatedAt: Date.now() }
      this.privateKey = undefined
    } finally { await rm(temporary, { recursive: true, force: true }) }
  }
}
