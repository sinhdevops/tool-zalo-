import FeaturePage from '../../layouts/FeaturePage'

export default function FriendsPage() {
  return (
    <FeaturePage page="friends" sections={[
      { title: 'Danh bạ bạn bè', description: 'Xem danh sách bạn bè và thông tin liên hệ của từng tài khoản.' },
      { title: 'Tìm kiếm và kết bạn', description: 'Tìm người dùng qua số điện thoại và quản lý lời mời đến, đi.' },
      { title: 'Quản lý liên hệ', description: 'Đặt biệt danh, xóa bạn bè, chặn và bỏ chặn liên hệ.' },
    ]} />
  )
}
