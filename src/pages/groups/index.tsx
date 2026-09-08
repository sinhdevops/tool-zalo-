import FeaturePage from '../../layouts/FeaturePage'

export default function GroupsPage() {
  return (
    <FeaturePage page="groups" sections={[
      { title: 'Danh sách và thông tin nhóm', description: 'Xem nhóm đã tham gia, tạo nhóm và cập nhật tên, ảnh đại diện.' },
      { title: 'Thành viên và quyền hạn', description: 'Quản lý thành viên, phó nhóm và quyền quản trị.' },
      { title: 'Lời mời và cài đặt nhóm', description: 'Quản lý liên kết mời, yêu cầu tham gia và các thiết lập nhóm.' },
    ]} />
  )
}
