import type { PageId } from '../routes/paths'
import { routeConfig } from '../routes/config'

interface FeatureSection {
  title: string
  description: string
}

interface FeaturePageProps {
  page: Exclude<PageId, 'dashboard' | 'components'>
  sections: readonly FeatureSection[]
}

/** Page scaffold used until the feature's API and workflows are implemented. */
export default function FeaturePage({ page, sections }: FeaturePageProps) {
  const { title, description, icon: Icon, group } = routeConfig[page]

  return (
    <div className="feature-page">
      <header className="page-heading">
        <span className="page-eyebrow">{group}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
      <div className="feature-notice" role="note">
        <span className="feature-notice__icon"><Icon aria-hidden="true" /></span>
        <div>
          <h2>Trang đang được xây dựng</h2>
          <p>Các chức năng bên dưới chưa được triển khai. Dữ liệu sẽ hiển thị khi kết nối tài khoản và hoàn tất tích hợp.</p>
        </div>
      </div>
      <h2 className="section-title">Chức năng dự kiến</h2>
      <div className="feature-grid">
        {sections.map((section) => (
          <section key={section.title} className="feature-card">
            <span className="feature-card__status">Chưa triển khai</span>
            <h3>{section.title}</h3>
            <p>{section.description}</p>
          </section>
        ))}
      </div>
    </div>
  )
}
