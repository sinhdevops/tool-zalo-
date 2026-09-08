import FeaturePage from '../../layouts/FeaturePage'

export default function PollsPage() {
  return (
    <FeaturePage page="polls" sections={[
      { title: 'Danh sách bình chọn', description: 'Theo dõi các cuộc bình chọn trong nhóm.' },
      { title: 'Tạo bình chọn', description: 'Chuẩn bị câu hỏi, phương án và thiết lập cuộc bình chọn.' },
      { title: 'Kết quả và đóng bình chọn', description: 'Xem kết quả chi tiết và khóa cuộc bình chọn khi hoàn tất.' },
    ]} />
  )
}
