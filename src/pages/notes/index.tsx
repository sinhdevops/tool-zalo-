import FeaturePage from '../../layouts/FeaturePage'

export default function NotesPage() {
  return (
    <FeaturePage page="notes" sections={[
      { title: 'Bảng tin nhóm', description: 'Xem các mục ghi chú trong bảng tin của nhóm.' },
      { title: 'Tạo ghi chú', description: 'Đăng nội dung cần chia sẻ với các thành viên trong nhóm.' },
      { title: 'Chỉnh sửa ghi chú', description: 'Cập nhật nội dung của các ghi chú đã tạo.' },
    ]} />
  )
}
