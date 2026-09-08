export type AccountStatus = 'connected' | 'restoring' | 'expired'

export interface Account {
  id: string
  displayName: string
  avatar: string
  phoneNumber: string
  createdAt: string
  lastLoginAt: string
  status: AccountStatus
}

export type LoginStatus = 'initializing' | 'qr_ready' | 'scanned' | 'authenticating' |
  'success' | 'expired' | 'declined' | 'cancelled' | 'error'

export interface LoginSession {
  id: string
  status: LoginStatus
  qrImage?: string
  expiresAt?: string
  displayName?: string
  account?: Account
  error?: string
}

export function isLoginPending(status: LoginStatus): boolean {
  return ['initializing', 'qr_ready', 'scanned', 'authenticating'].includes(status)
}
