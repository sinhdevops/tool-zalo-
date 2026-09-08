import { useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { Dropdown, Input, Textarea } from '../../components/common'
import type { SelectOption } from '../../components/common'
import {
  DropdownValidation, InputValidation, TextareaValidation,
} from '../../components/validation'
import './components.css'

type AccountType = 'personal' | 'business'
type ContactGroup = 'customers' | 'partners' | 'internal' | 'archived'

interface DemoFormValues {
  displayName: string
  email: string
  accountType: AccountType | ''
  group: ContactGroup | ''
  note: string
}

const accountOptions: SelectOption<AccountType>[] = [
  { value: 'personal', label: 'Tài khoản cá nhân' },
  { value: 'business', label: 'Tài khoản doanh nghiệp' },
]
const groupOptions: SelectOption<ContactGroup>[] = [
  { value: 'customers', label: 'Khách hàng' },
  { value: 'partners', label: 'Đối tác' },
  { value: 'internal', label: 'Nội bộ' },
  { value: 'archived', label: 'Đã lưu trữ', disabled: true },
]
const defaultValues: DemoFormValues = { displayName: '', email: '', accountType: '', group: '', note: '' }

export default function ComponentsPage() {
  const methods = useForm<DemoFormValues>({ defaultValues, mode: 'onBlur' })
  const { control, handleSubmit, reset, formState: { isSubmitting } } = methods
  const [submitted, setSubmitted] = useState<DemoFormValues | null>(null)
  const [group, setGroup] = useState<ContactGroup>('customers')

  return (
    <div className="showcase">
      <header className="showcase__header">
        <span className="showcase__eyebrow">ZALO TOOL / UI COMPONENTS</span>
        <h1>Bộ thành phần biểu mẫu</h1>
        <p>Input, select, textarea và dropdown dùng chung cho toàn ứng dụng.</p>
      </header>

      <section className="showcase__panel" aria-labelledby="validation-title">
        <div className="showcase__section-heading">
          <div><h2 id="validation-title">Biểu mẫu có validation</h2><p>Thử gửi khi chưa điền để xem thông báo lỗi.</p></div>
          <span className="showcase__badge">React Hook Form</span>
        </div>
        <FormProvider {...methods}>
          <form noValidate onSubmit={handleSubmit(setSubmitted)}>
            <div className="showcase__grid">
              <InputValidation name="displayName" control={control} label="Tên hiển thị"
                placeholder="Nhập tên hiển thị" autoComplete="name"
                rules={{
                  required: 'Vui lòng nhập tên hiển thị.',
                  validate: (value) => value.trim().length >= 2 || 'Tên cần ít nhất 2 ký tự, không tính khoảng trắng.',
                }} />
              <InputValidation name="email" control={control} type="email" label="Email"
                placeholder="ban@example.com" autoComplete="email"
                rules={{
                  required: 'Vui lòng nhập email.',
                  pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Email chưa đúng định dạng.' },
                }} />
              <DropdownValidation<DemoFormValues, 'accountType'> name="accountType" label="Loại tài khoản" options={accountOptions}
                placeholder="Chọn loại tài khoản" rules={{ required: 'Vui lòng chọn loại tài khoản.' }} />
              <DropdownValidation<DemoFormValues, 'group'> name="group" label="Nhóm liên hệ" options={groupOptions}
                placeholder="Chọn nhóm liên hệ" helperText="Có thể dùng phím ↑ ↓ và Enter để chọn."
                rules={{ required: 'Vui lòng chọn nhóm liên hệ.' }} />
              <TextareaValidation<DemoFormValues> name="note" label="Ghi chú" wrapperClassName="showcase__full"
                placeholder="Thêm thông tin nếu cần…" helperText="Không bắt buộc. Tối đa 300 ký tự."
                rules={{ maxLength: { value: 300, message: 'Ghi chú không được vượt quá 300 ký tự.' } }} />
            </div>
            <div className="showcase__actions">
              <button type="button" className="demo-button demo-button--secondary"
                onClick={() => { reset(); setSubmitted(null) }}>Đặt lại</button>
              <button type="submit" className="demo-button" disabled={isSubmitting}>Kiểm tra biểu mẫu</button>
            </div>
          </form>
        </FormProvider>
        {submitted && (
          <div className="showcase__result" role="status">
            <strong>Dữ liệu hợp lệ</strong>
            <p>Đây là bản minh họa, dữ liệu chỉ hiển thị tại đây.</p>
            <pre>{JSON.stringify(submitted, null, 2)}</pre>
          </div>
        )}
      </section>

      <section className="showcase__panel" aria-labelledby="common-title">
        <div className="showcase__section-heading">
          <div><h2 id="common-title">Component độc lập</h2><p>Sử dụng trực tiếp với props và state thông thường.</p></div>
        </div>
        <div className="showcase__grid">
          <Input label="Tìm kiếm" type="search" placeholder="Tìm theo tên…" helperText="Input thông thường, không cần form context." />
          <Dropdown label="Bộ lọc tài khoản" options={accountOptions} defaultValue="personal" />
          <Dropdown label="Nhóm đang chọn" options={groupOptions} value={group} onChange={setGroup} />
          <Input label="Trạng thái vô hiệu hóa" disabled value="Chưa thể chỉnh sửa" />
          <Input label="Lỗi từ máy chủ (minh họa)" defaultValue="ten-da-ton-tai"
            error="Tên này đã được sử dụng." />
          <Textarea label="Nội dung" rows={3} placeholder="Nhập nội dung…" />
        </div>
      </section>
    </div>
  )
}

