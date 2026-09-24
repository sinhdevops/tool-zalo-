const API_ORIGIN = import.meta.env.DEV
  ? ''
  : (import.meta.env.VITE_API_ORIGIN || 'https://api.muh5.site').replace(/\/$/, '')

export function apiUrl(path: string): string {
  return `${API_ORIGIN}${path}`
}
