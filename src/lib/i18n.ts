export type Language = 'vi' | 'en' | 'zh'

export interface I18nTranslations {
  // Brand & Intro
  appName: string
  appTagline: string
  heroEyebrow: string
  heroTitle: string
  featureRealtime: string
  featureNoAudio: string
  featureLocalBackup: string

  // Login Form
  formTitle: string
  formSubtitle: string
  emailLabel: string
  emailPlaceholder: string
  getOtpBtn: string
  gettingOtpBtn: string

  // OTP Verification Card
  otpSentTitle: string
  otpSentDesc: string
  otpInputLabel: string
  otpPlaceholder: string
  verifyBtn: string
  verifyingBtn: string
  changeEmailBtn: string
  resendOtpBtn: string
  resendCountdown: string

  // Errors & Alerts
  errorInvalidEmail: string
  errorRateLimit: string
  errorSendOtp: string
  errorInvalidOtp: string
  errorExpiredToken: string
  errorAccessDenied: string
  errorGeneric: string

  // Footer & Nav
  adminLink: string
  themeDark: string
  themeLight: string
  navSession: string
  navHistory: string
  profileLogout: string
  profileGuest: string
}

export const translations: Record<Language, I18nTranslations> = {
  vi: {
    appName: 'Pay2Pay Interpreter',
    appTagline: 'Live Interpreter',
    heroEyebrow: 'Phiên dịch hội thoại trực tiếp',
    heroTitle: 'Phiên dịch hội thoại song ngữ tức thì.',
    featureRealtime: 'Dịch hai chiều theo thời gian thực',
    featureNoAudio: 'Không lưu âm thanh gốc',
    featureLocalBackup: 'Lưu transcript cục bộ khi mất mạng',

    formTitle: 'Bắt đầu phiên dịch',
    formSubtitle: 'Vui lòng nhập email để nhận mã xác thực OTP truy cập ứng dụng.',
    emailLabel: 'Email',
    emailPlaceholder: 'Ví dụ: name@gmail.com',
    getOtpBtn: 'Lấy mã OTP',
    gettingOtpBtn: 'Đang gửi mã OTP...',

    otpSentTitle: 'Đã gửi mã xác thực OTP',
    otpSentDesc: 'Đã gửi mã đến {email}. Vui lòng kiểm tra hộp thư (hoặc mục Thư rác/Spam) và nhập mã OTP 6 số bên dưới:',
    otpInputLabel: 'Nhập mã OTP 6 số',
    otpPlaceholder: '123456',
    verifyBtn: 'Xác nhận đăng nhập',
    verifyingBtn: 'Đang xác thực...',
    changeEmailBtn: 'Thay đổi email',
    resendOtpBtn: 'Gửi lại mã OTP',
    resendCountdown: 'Gửi lại sau ({seconds}s)',

    errorInvalidEmail: 'Email không hợp lệ. Vui lòng nhập đúng định dạng email.',
    errorRateLimit: 'Hệ thống đang trong thời gian chờ an toàn. Vui lòng đợi khoảng 60 giây rồi bấm gửi lại.',
    errorSendOtp: 'Không thể gửi mã OTP. Vui lòng kiểm tra lại email hoặc thử lại sau.',
    errorInvalidOtp: 'Mã xác thực không chính xác hoặc đã hết hạn.',
    errorExpiredToken: 'Liên kết đăng nhập hoặc mã OTP không hợp lệ hoặc đã hết hạn. Vui lòng lấy mã mới.',
    errorAccessDenied: 'Đăng nhập thất bại. Email không được phép truy cập.',
    errorGeneric: 'Xác thực thất bại. Vui lòng thử lại.',

    adminLink: 'Quản trị',
    themeDark: 'Dùng giao diện tối',
    themeLight: 'Dùng giao diện sáng',
    navSession: 'Phiên dịch',
    navHistory: 'Lịch sử',
    profileLogout: 'Đăng xuất',
    profileGuest: 'Khách',
  },
  en: {
    appName: 'Pay2Pay Interpreter',
    appTagline: 'Live Interpreter',
    heroEyebrow: 'Live Conversation Interpreter',
    heroTitle: 'Instant bilingual conversation interpretation.',
    featureRealtime: 'Real-time two-way translation',
    featureNoAudio: 'Original audio is never stored',
    featureLocalBackup: 'Local transcript backup when offline',

    formTitle: 'Start Interpreting',
    formSubtitle: 'Please enter your email to receive a 6-digit OTP code to access the app.',
    emailLabel: 'Email address',
    emailPlaceholder: 'E.g., name@gmail.com',
    getOtpBtn: 'Get OTP Code',
    gettingOtpBtn: 'Sending OTP code...',

    otpSentTitle: 'OTP verification code sent',
    otpSentDesc: 'A 6-digit code has been sent to {email}. Please check your inbox (or Spam folder) and enter it below:',
    otpInputLabel: 'Enter 6-digit OTP code',
    otpPlaceholder: '123456',
    verifyBtn: 'Verify & Sign In',
    verifyingBtn: 'Verifying...',
    changeEmailBtn: 'Change email',
    resendOtpBtn: 'Resend OTP',
    resendCountdown: 'Resend in ({seconds}s)',

    errorInvalidEmail: 'Invalid email address. Please enter a valid email.',
    errorRateLimit: 'System is in cooldown period. Please wait about 60 seconds before requesting again.',
    errorSendOtp: 'Failed to send OTP code. Please verify your email or try again later.',
    errorInvalidOtp: 'Invalid or expired verification code.',
    errorExpiredToken: 'Login session or code has expired. Please request a new OTP code.',
    errorAccessDenied: 'Login failed. Access is denied for this account.',
    errorGeneric: 'Authentication failed. Please try again.',

    adminLink: 'Admin',
    themeDark: 'Dark mode',
    themeLight: 'Light mode',
    navSession: 'Interpreter',
    navHistory: 'History',
    profileLogout: 'Sign Out',
    profileGuest: 'Guest',
  },
  zh: {
    appName: 'Pay2Pay 同声传译',
    appTagline: '实时同声传译',
    heroEyebrow: '实时对话同声传译',
    heroTitle: '即时双语对话同传翻译。',
    featureRealtime: '实时双向同声传译',
    featureNoAudio: '绝不保存原始音频',
    featureLocalBackup: '离线状态下本地自动备份',

    formTitle: '开始同传翻译',
    formSubtitle: '请输入您的电子邮箱以获取 6 位数验证码 (OTP) 登录。',
    emailLabel: '电子邮箱',
    emailPlaceholder: '例如：name@gmail.com',
    getOtpBtn: '获取验证码',
    gettingOtpBtn: '正在发送验证码...',

    otpSentTitle: '验证码已发送',
    otpSentDesc: '6 位数验证码已发送至 {email}。请检查收件箱（或垃圾邮件箱）并在下方输入：',
    otpInputLabel: '输入 6 位数验证码 (OTP)',
    otpPlaceholder: '123456',
    verifyBtn: '确认登录',
    verifyingBtn: '正在验证...',
    changeEmailBtn: '更改邮箱',
    resendOtpBtn: '重新发送验证码',
    resendCountdown: '重新发送 ({seconds}秒)',

    errorInvalidEmail: '邮箱格式不正确，请输入有效的邮箱地址。',
    errorRateLimit: '操作过于频繁，请等待约 60 秒后再重新获取验证码。',
    errorSendOtp: '发送验证码失败，请检查邮箱地址或稍后重试。',
    errorInvalidOtp: '验证码不正确或已过期。',
    errorExpiredToken: '登录凭证或验证码无效或已过期，请重新获取验证码。',
    errorAccessDenied: '登录失败，该邮箱未获授权访问。',
    errorGeneric: '认证失败，请重试。',

    adminLink: '管理后台',
    themeDark: '深色模式',
    themeLight: '浅色模式',
    navSession: '同声传译',
    navHistory: '历史记录',
    profileLogout: '退出登录',
    profileGuest: '访客',
  },
}

export function detectMachineLanguage(): Language {
  if (typeof window === 'undefined') return 'vi'

  const navLang = (
    navigator.languages?.[0] ||
    navigator.language ||
    (navigator as any).userLanguage ||
    ''
  ).toLowerCase()

  if (navLang.startsWith('zh')) return 'zh'
  if (navLang.startsWith('en')) return 'en'
  if (navLang.startsWith('vi')) return 'vi'

  return 'en'
}
