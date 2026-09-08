import { Zalo, LoginQRCallbackEventType } from 'zalo-api-final'
import type { API, Credentials } from 'zalo-api-final'
import type { Account, LoginSession } from '../../shared/accounts.ts'
import { ZaloMessagingConnection } from '../messages/connection.ts'
import type { MessagingConnection } from '../messages/types.ts'
import type { UnreadStore } from '../messages/unread-store.ts'
import type { EncryptedChatStore } from '../messages/chat-store.ts'
import { createZaloTransport } from './zalo-transport.ts'

export type AccountProfile = Pick<Account, 'id' | 'displayName' | 'avatar' | 'phoneNumber'>
export type LoginUpdate = Pick<LoginSession, 'status' | 'qrImage' | 'expiresAt' | 'displayName'>

export interface AccountConnection {
  profile: AccountProfile
  credentials: Credentials
  disconnect: () => void
  messaging?: MessagingConnection
}

export interface AccountGateway {
  loginQR: (update: (event: LoginUpdate) => void, signal: AbortSignal) => Promise<AccountConnection>
  restore: (credentials: Credentials, signal: AbortSignal) => Promise<AccountConnection>
}

function createClient(signal: AbortSignal, cookies?: Credentials['cookie']) {
  const transport = createZaloTransport(signal, cookies)
  const zalo = new Zalo({
    logging: false,
    checkUpdate: false,
    selfListen: true,
    polyfill: transport.request,
  })
  return { zalo, ...transport }
}

async function getProfile(api: API, fallback?: { displayName: string; avatar: string }): Promise<AccountProfile> {
  const id = api.getOwnId()
  if (!id) throw new Error('Missing account identifier')
  try {
    const info = await api.fetchAccountInfo()
    return {
      id,
      displayName: info.displayName || info.zaloName || fallback?.displayName || `Zalo ${id}`,
      avatar: info.avatar || fallback?.avatar || '',
      phoneNumber: info.phoneNumber || '',
    }
  } catch {
    // Login can succeed even when the optional profile endpoint is unavailable.
    return { id, displayName: fallback?.displayName || `Zalo ${id}`, avatar: fallback?.avatar || '', phoneNumber: '' }
  }
}

export function createZaloGateway(unreadStore?: UnreadStore, chatStore?: EncryptedChatStore): AccountGateway { return {
  async loginQR(update, signal) {
    let credentials: Credentials | undefined
    let scannedProfile: { displayName: string; avatar: string } | undefined
    const client = createClient(signal)
    const api = await client.zalo.loginQR({}, (event) => {
      // The SDK constructs its internal controller after QRCodeGenerated fires.
      // Never invoke its abort callback synchronously in that event.
      if (signal.aborted) return
      switch (event.type) {
        case LoginQRCallbackEventType.QRCodeGenerated:
          update({ status: 'qr_ready', qrImage: `data:image/png;base64,${event.data.image}`, expiresAt: new Date(Date.now() + 100_000).toISOString() })
          break
        case LoginQRCallbackEventType.QRCodeScanned:
          scannedProfile = { displayName: event.data.display_name, avatar: event.data.avatar }
          update({ status: 'scanned', displayName: scannedProfile.displayName })
          break
        case LoginQRCallbackEventType.QRCodeExpired:
          event.actions.abort()
          update({ status: 'expired' })
          break
        case LoginQRCallbackEventType.QRCodeDeclined:
          event.actions.abort()
          update({ status: 'declined' })
          break
        case LoginQRCallbackEventType.GotLoginInfo:
          // SDK uses this same cookie array for loginCookie immediately after the callback.
          event.data.cookie.splice(0, event.data.cookie.length, ...client.cookies())
          credentials = event.data
          update({ status: 'authenticating' })
          break
      }
    })
    if (!credentials || signal.aborted) {
      api.listener.stop()
      throw new Error('Login cancelled or credentials unavailable')
    }
    const profile = await getProfile(api, scannedProfile)
    client.authenticated()
    const messaging = new ZaloMessagingConnection(api, profile.id, profile.displayName, profile.avatar, unreadStore, chatStore)
    return { profile, credentials, messaging, disconnect: () => { client.disconnect(); messaging.dispose() } }
  },
  async restore(credentials, signal) {
    const client = createClient(signal, credentials.cookie)
    const api = await client.zalo.login(credentials)
    const profile = await getProfile(api)
    client.authenticated()
    const messaging = new ZaloMessagingConnection(api, profile.id, profile.displayName, profile.avatar, unreadStore, chatStore)
    return { profile, credentials, messaging, disconnect: () => { client.disconnect(); messaging.dispose() } }
  },
}
}
export const zaloGateway = createZaloGateway()
