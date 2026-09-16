const API_ORIGIN = 'https://api.muh5.site'

export function apiUrl(path: string): string {
  return `${API_ORIGIN}${path}`
}
