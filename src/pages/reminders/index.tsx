import FeaturePage from '../../layouts/FeaturePage'

export default function RemindersPage() {
  return (
    <FeaturePage page="reminders" sections={[
      { title: 'Danh sách nhắc nhở', description: 'Theo dõi lịch nhắc và thông tin của từng lời nhắc.' },
      { title: 'Tạo và chỉnh sửa', description: 'Tạo lịch nhắc mới, điều chỉnh nội dung hoặc xóa lịch nhắc.' },
      { title: 'Phản hồi thành viên', description: 'Xem các phản hồi liên quan đến lời nhắc trong nhóm.' },
    ]} />
  )
}
