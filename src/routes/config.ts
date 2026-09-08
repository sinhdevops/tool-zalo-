import { lazy } from 'react'
import type { ComponentType, LazyExoticComponent } from 'react'
import type { IconType } from 'react-icons'
import {
  FiBarChart2, FiBox, FiClock, FiFileText, FiGrid, FiLayers,
  FiMessageSquare, FiSettings, FiUserPlus, FiUsers, FiZap,
} from 'react-icons/fi'
import { routePaths } from './paths'
import type { PageId } from './paths'

export const navigationGroups = ['Không gian làm việc', 'Công cụ', 'Hệ thống'] as const

interface AppRoute<TId extends PageId = PageId> {
  id: TId
  path: (typeof routePaths)[TId]
  title: string
  description: string
  group: (typeof navigationGroups)[number]
  icon: IconType
  Component: LazyExoticComponent<ComponentType>
}

// This map requires every PageId and binds each id to its own path.
export const routeConfig = {
  dashboard: {
    id: 'dashboard', path: routePaths.dashboard, title: 'Tổng quan',
    description: 'Không gian quản lý hoạt động Zalo của bạn.',
    group: 'Không gian làm việc', icon: FiGrid,
    Component: lazy(() => import('../pages/dashboard')),
  },
  accounts: {
    id: 'accounts', path: routePaths.accounts, title: 'Tài khoản',
    description: 'Kết nối và quản lý các tài khoản Zalo cá nhân.',
    group: 'Không gian làm việc', icon: FiUsers,
    Component: lazy(() => import('../pages/accounts')),
  },
  messages: {
    id: 'messages', path: routePaths.messages, title: 'Tin nhắn',
    description: 'Hội thoại, nội dung tin nhắn và tệp đính kèm.',
    group: 'Không gian làm việc', icon: FiMessageSquare,
    Component: lazy(() => import('../pages/messages')),
  },
  friends: {
    id: 'friends', path: routePaths.friends, title: 'Bạn bè',
    description: 'Danh bạ, tìm kiếm và các lời mời kết bạn.',
    group: 'Không gian làm việc', icon: FiUserPlus,
    Component: lazy(() => import('../pages/friends')),
  },
  groups: {
    id: 'groups', path: routePaths.groups, title: 'Nhóm',
    description: 'Thông tin nhóm, thành viên và quyền quản trị.',
    group: 'Không gian làm việc', icon: FiLayers,
    Component: lazy(() => import('../pages/groups')),
  },
  leads: {
    id: 'leads', path: routePaths.leads, title: 'Quản lý lead',
    description: 'Thông tin khách hàng và tiến độ liên hệ từ nhóm.',
    group: 'Không gian làm việc', icon: FiFileText,
    Component: lazy(() => import('../pages/leads')),
  },
  polls: {
    id: 'polls', path: routePaths.polls, title: 'Bình chọn',
    description: 'Tạo và theo dõi các cuộc bình chọn trong nhóm.',
    group: 'Công cụ', icon: FiBarChart2,
    Component: lazy(() => import('../pages/polls')),
  },
  notes: {
    id: 'notes', path: routePaths.notes, title: 'Ghi chú',
    description: 'Quản lý nội dung ghi chú và bảng tin nhóm.',
    group: 'Công cụ', icon: FiFileText,
    Component: lazy(() => import('../pages/notes')),
  },
  reminders: {
    id: 'reminders', path: routePaths.reminders, title: 'Nhắc nhở',
    description: 'Theo dõi lịch nhắc và phản hồi của thành viên.',
    group: 'Công cụ', icon: FiClock,
    Component: lazy(() => import('../pages/reminders')),
  },
  automation: {
    id: 'automation', path: routePaths.automation, title: 'Tự động hóa',
    description: 'Quản lý quy tắc trả lời và các sự kiện Zalo.',
    group: 'Công cụ', icon: FiZap,
    Component: lazy(() => import('../pages/automation')),
  },
  settings: {
    id: 'settings', path: routePaths.settings, title: 'Cài đặt',
    description: 'Thiết lập ứng dụng, thông báo và kết nối.',
    group: 'Hệ thống', icon: FiSettings,
    Component: lazy(() => import('../pages/settings')),
  },
  components: {
    id: 'components', path: routePaths.components, title: 'Component dùng chung',
    description: 'Thư viện biểu mẫu và ví dụ validation.',
    group: 'Hệ thống', icon: FiBox,
    Component: lazy(() => import('../pages/components')),
  },
} satisfies { [TId in PageId]: AppRoute<TId> }

export const appRoutes = Object.values(routeConfig)
