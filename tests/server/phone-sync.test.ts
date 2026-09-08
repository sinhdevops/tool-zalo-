import assert from 'node:assert/strict'
import { createCipheriv, constants, generateKeyPairSync, publicEncrypt, randomBytes } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { compress, initWasm } from 'lzma-wasm'
import { extractZaloBackup } from '../../server/messages/phone-sync.ts'

function u32(value: number) { const result = Buffer.alloc(4); result.writeUInt32BE(value); return result }
function encryptChunks(plain: Buffer, key: Buffer) {
  const parts: Buffer[] = []
  for (let offset = 0; offset < plain.length; offset += 65_536) {
    const cipher = createCipheriv('aes-256-cbc', key, Buffer.alloc(16)); cipher.setAutoPadding(false)
    parts.push(cipher.update(plain.subarray(offset, offset + 65_536)), cipher.final())
  }
  return Buffer.concat(parts)
}

test('phone sync decrypts the ZDB4 container and extracts only safe paths', async () => {
  await initWasm()
  const body = Buffer.from('SQLite format 3\0phone sync fixture')
  const name = Buffer.from('Core/Message/123.db')
  const payload = Buffer.from(compress(body, { format: 'xz' }))
  let plain = Buffer.concat([Buffer.from('ZDB4.0'), Buffer.alloc(8), u32(1), u32(name.length), name, u32(body.length), payload])
  if (plain.length % 16) plain = Buffer.concat([plain, Buffer.alloc(16 - plain.length % 16)])
  const transportKey = randomBytes(32)
  const containerKey = Buffer.from(transportKey.toString('hex').toUpperCase().slice(0, 32), 'ascii')
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } })
  const encryptedKey = publicEncrypt({ key: pair.publicKey, padding: constants.RSA_PKCS1_PADDING }, transportKey).toString('base64')
  const output = await mkdtemp(path.join(tmpdir(), 'phone-sync-test-'))
  try {
    const files = await extractZaloBackup(encryptChunks(plain, containerKey), pair.privateKey, encryptedKey, output)
    assert.deepEqual(files, [path.join(output, 'Core', 'Message', '123.db')])
    assert.deepEqual(await readFile(files[0]!), body)
  } finally { await rm(output, { recursive: true, force: true }) }
})
