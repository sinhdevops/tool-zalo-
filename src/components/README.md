# Form components

## Common

Import từ `components/common`: `Input`, `Select`, `Textarea`, `Dropdown`, `FormField`.

Các trường chọn trên giao diện ứng dụng dùng `Dropdown`; trong form RHF dùng `DropdownValidation`. Đây là kiểu dropdown tùy biến có nền xanh và dấu ✓ ở lựa chọn hiện tại.

- Props chung: `id`, `name`, `label`, `helperText`, `error` (chuỗi hoặc `{ message }`), `required`, `disabled`, `className` (control), `wrapperClassName` (toàn field).
- `ref` trỏ tới input/select/textarea hoặc button của dropdown. Dự án dùng React 19 nên nhận `ref` trực tiếp.
- Input/Select/Textarea chuyển các props HTML còn lại xuống control; hỗ trợ `register`, `value`/`onChange` hoặc `defaultValue`.
- `Select` là native single select, `onChange(event)` trả giá trị chuỗi qua `event.target.value`.
- `Dropdown` là single select tùy biến, `onChange(value)` trả nguyên kiểu giá trị option. Hỗ trợ controlled/uncontrolled, phím mũi tên, Home/End, Enter/Space, Escape, Tab và gõ tiền tố nhãn để chọn. Focus giữ trên trigger, click bên ngoài đóng danh sách.
- `options`: mảng chuỗi/số hoặc `{ value, label, disabled? }`. Giá trị phải duy nhất; dùng `''` cho chưa chọn. Nên dùng chuỗi cho native Select. `label` của option dùng chuỗi để hỗ trợ tìm bằng bàn phím.
- Truyền `placeholder` để đổi nhãn mặc định; với Select dùng `placeholder={null}` để bỏ option trống. Với Dropdown dùng `emptyText` khi không có options.
- Không có label hiển thị thì phải truyền `aria-label` hoặc `aria-labelledby`.

```tsx
import { useState } from 'react'
import { Input, Dropdown } from './components/common'

function Filters() {
  const [group, setGroup] = useState('')
  return <>
    <Input label="Tìm kiếm" type="search" placeholder="Nhập tên…" />
    <Dropdown label="Nhóm" value={group} onChange={setGroup}
      options={[{ value: 'customers', label: 'Khách hàng' }]} />
  </>
}
```

## React Hook Form

Import từ `components/validation`: `InputValidation`, `SelectValidation`, `TextareaValidation`, `DropdownValidation`.

Các component dùng chung hook `useValidationField` với `useController` và `useFormContext`. Props, ref và event handler có kiểu riêng cho từng control:

- Bắt buộc có `name` và **một trong hai**: prop `control` từ `useForm`, hoặc ancestor `FormProvider`.
- Hỗ trợ tên lồng như `profile.email`, `rules`, `defaultValue`, `shouldUnregister`, `disabled`.
- Khai báo đầy đủ `defaultValues` ở `useForm` (hoặc `defaultValue` cho mỗi field) để `reset()` và dirty state nhất quán; dùng `''` cho giá trị trống. Control hiển thị `''` khi chưa có giá trị, nhưng không tự thêm giá trị này vào dữ liệu RHF.
- Truyền `control` để TypeScript suy luận kiểu form. Khi lấy control từ `FormProvider`, cần truyền generic như `<InputValidation<ProfileValues> ... />` vì React context không truyền generic từ cha xuống con ở bước biên dịch.
- `InputValidation`, `TextareaValidation`, `SelectValidation` nhận đường dẫn tới field kiểu chuỗi. `DropdownValidation` nhận field chuỗi/số; truyền cả generic tên field để ràng buộc chính xác kiểu `options`, `defaultValue` và `onChange`.
- Validation khai báo qua `rules` của RHF, hoặc resolver ở `useForm`. `required` trên UI là trạng thái hiển thị/native HTML, không thay thế `rules.required`. Dấu bắt buộc tự lấy từ `rules.required`; với resolver truyền thêm `required` nếu muốn hiển thị dấu.
- Lỗi từ `fieldState.error` tự hiển thị, bao gồm `setError('field', { message: '...' })`. `error` truyền trực tiếp sẽ ưu tiên hơn lỗi RHF.
- `onChange` và `onBlur` bổ sung được gọi sau handler RHF, không làm mất đăng ký field. Không truyền thêm `register`, `value` hoặc `ref` vào bản Validation; dùng `setValue`, `setFocus`, `reset` của RHF.
- `InputValidation` dành cho input dạng văn bản (text/email/password/tel/search/url/number/date…). Checkbox, radio, file cần adapter riêng theo `checked`/`files`, không dùng component này.
- Input số vẫn trả chuỗi HTML; nếu cần số, chuyển đổi trong resolver hoặc khi xử lý submit. Dropdown giữ nguyên kiểu số của option.
- Với Dropdown, dùng `DropdownValidation` để kết nối RHF; không dùng `register` trực tiếp. Reset bản độc lập bằng controlled value.

```tsx
import { FormProvider, useForm } from 'react-hook-form'
import { InputValidation, DropdownValidation } from './components/validation'

interface ProfileValues {
  email: string
  accountType: 'personal' | 'business' | ''
}

function ProfileForm() {
  const methods = useForm<ProfileValues>({
    defaultValues: { email: '', accountType: '' },
    mode: 'onBlur',
  })
  const { control, handleSubmit, reset } = methods

  return (
    <FormProvider {...methods}>
      <form noValidate onSubmit={handleSubmit((data) => console.log(data))}>
        <InputValidation name="email" control={control} label="Email" type="email"
          rules={{ required: 'Vui lòng nhập email.' }} />
        {/* Không truyền control: tự lấy từ FormProvider. */}
        <DropdownValidation<ProfileValues, 'accountType'> name="accountType" label="Loại tài khoản"
          options={[{ value: 'personal', label: 'Cá nhân' }]}
          rules={{ required: 'Vui lòng chọn loại tài khoản.' }} />
        <button type="button" onClick={() => reset()}>Đặt lại</button>
        <button type="submit">Lưu</button>
      </form>
    </FormProvider>
  )
}
```

Đặt `noValidate` trên form để thông báo RHF thay thế popup validation của trình duyệt. `pages/components/index.tsx` tại route `/components` minh họa input, textarea và dropdown tùy biến, submit hợp lệ và reset; không gọi API.

Các barrel export cả kiểu public: `InputProps`, `SelectProps`, `TextareaProps`, `DropdownProps`, `SelectOption`, `OptionValue`, `FormFieldProps` và các kiểu `*ValidationProps`. Dùng `import type` khi import các kiểu này. `pnpm typecheck` kiểm tra strict TypeScript; `pnpm build` luôn kiểm tra kiểu trước khi build.

CSS common chỉ dùng các class `.form-field`, `.form-control`, `.dropdown`. Có thể override `--field-border`, `--field-focus`, `--field-error` trên wrapper. CSS trang demo ở `pages/components/components.css`, không thuộc thư viện component.
