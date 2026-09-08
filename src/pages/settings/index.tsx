import { Link, useSearchParams } from 'react-router-dom'
import { FiFileText, FiRefreshCw, FiSettings, FiZap } from 'react-icons/fi'
import { useChatPolling } from '../messages/hooks/useChatPolling'
import { automationApi } from '../automation/api'
import './settings.css'

type SettingsTab = 'general' | 'log'

function LogPanel() {
  const { data, error, refresh } = useChatPolling(automationApi.logs, 5000)
  return (
    <section className="settings-log" role="tabpanel" id="settings-panel-log" aria-labelledby="settings-tab-log">
      <div className="settings-log__heading">
        <div><h2>Nhật ký hoạt động</h2><p>Ứng dụng chỉ lưu 100 hoạt động mới nhất.</p></div>
        <div className="settings-log__actions"><span>{data ? `${data.logs.length} / ${data.limit}` : '— / 100'}</span><button type="button" onClick={refresh}><FiRefreshCw /> Làm mới</button></div>
      </div>
      {error && <p className="settings-error" role="alert">{error}</p>}
      {!data && !error ? <p className="settings-loading">Đang tải nhật ký…</p> : data && data.logs.length === 0 ? (
        <div className="settings-log__empty"><FiZap /><strong>Chưa có hoạt động</strong><p>Nhật ký sẽ xuất hiện khi bạn cấu hình hoặc chạy tính năng tự động.</p></div>
      ) : data ? <ul className="settings-log__list">{data.logs.map((log) => (
        <li key={log.id}><time>{new Date(log.at).toLocaleString('vi-VN')}</time><span>{log.text}</span>{log.leadId && <Link to={`/leads?lead=${encodeURIComponent(log.leadId)}`}>Xem lead</Link>}</li>
      ))}</ul> : null}
    </section>
  )
}

function GeneralPanel() {
  return (
    <div className="settings-grid" role="tabpanel" id="settings-panel-general" aria-labelledby="settings-tab-general">
      <section><FiSettings /><div><h2>Thiết lập ứng dụng</h2><p>Các tùy chọn hiển thị và hành vi của ứng dụng sẽ được quản lý tại đây.</p></div></section>
      <section><FiFileText /><div><h2>Lưu trữ dữ liệu</h2><p>Lead và nhật ký tự động hóa được lưu cục bộ cùng dữ liệu backend.</p></div></section>
    </div>
  )
}

export default function SettingsPage() {
  const [params, setParams] = useSearchParams()
  const tab: SettingsTab = params.get('tab') === 'log' ? 'log' : 'general'
  function select(next: SettingsTab) { setParams(next === 'general' ? {} : { tab: next }, { replace: true }) }

  return (
    <div className="settings-page">
      <header className="page-heading"><span className="page-eyebrow">Hệ thống</span><h1>Cài đặt</h1><p>Quản lý thiết lập ứng dụng và theo dõi nhật ký hoạt động.</p></header>
      <div className="settings-tabs" role="tablist" aria-label="Cài đặt">
        <button id="settings-tab-general" role="tab" aria-selected={tab === 'general'} aria-controls="settings-panel-general" onClick={() => select('general')}><FiSettings /> Cài đặt chung</button>
        <button id="settings-tab-log" role="tab" aria-selected={tab === 'log'} aria-controls="settings-panel-log" onClick={() => select('log')}><FiFileText /> Log</button>
      </div>
      {tab === 'log' ? <LogPanel /> : <GeneralPanel />}
    </div>
  )
}
