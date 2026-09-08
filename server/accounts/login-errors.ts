const sdkErrors = ['Cannot get API login version', 'Unable to generate QRCode', 'Unable to login with QRCode', "Can't get account info", "Can't login", 'Đăng nhập thất bại', 'Khởi tạo ngữ cảnh thất bại.', 'Missing required params']
export function safeLoginError(error: unknown): string {
  if (!(error instanceof Error)) return 'UNKNOWN'
  const known = sdkErrors.find((message) => error.message.startsWith(message))
  if (known) return known
  const code = 'code' in error ? String(error.code) : ''
  if (/^[A-Z_0-9]{2,40}$/.test(code)) return code
  return ['TypeError', 'AbortError', 'TimeoutError', 'SyntaxError'].includes(error.name) ? error.name : 'SDK_ERROR'
}

export function loginErrorMessage(error: unknown, saving: boolean): string {
  if (saving) return 'Đăng nhập Zalo đã thành công nhưng không lưu được phiên trên máy. Kiểm tra quyền ghi thư mục dữ liệu của công cụ.'
  const code = safeLoginError(error)
  if (code === "Can't login" || code === "Can't get account info") return 'Zalo chưa cấp được phiên đăng nhập sau khi xác nhận. Hãy tạo mã mới và xác nhận Đăng nhập trên điện thoại.'
  if (code === 'Cannot get API login version' || code === 'Unable to generate QRCode') return 'Không lấy được mã QR từ Zalo. Hãy thử tạo lại mã.'
  if (code === 'Đăng nhập thất bại' || code === 'Khởi tạo ngữ cảnh thất bại.') return 'Đã xác nhận QR nhưng chưa khởi tạo được kết nối Zalo. Hãy thử đăng nhập lại.'
  return 'Không thể hoàn tất đăng nhập. Hãy kiểm tra kết nối và thử tạo mã QR mới.'
}
