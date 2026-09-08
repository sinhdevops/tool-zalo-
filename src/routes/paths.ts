export const routePaths = {
  home: '/',
  dashboard: '/dashboard',
  accounts: '/accounts',
  messages: '/messages',
  friends: '/friends',
  groups: '/groups',
  polls: '/polls',
  notes: '/notes',
  reminders: '/reminders',
  automation: '/automation',
  leads: '/leads',
  settings: '/settings',
  components: '/components',
} as const

export type PageId = Exclude<keyof typeof routePaths, 'home'>
export type AppPath = (typeof routePaths)[keyof typeof routePaths]
