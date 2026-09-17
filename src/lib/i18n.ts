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

  // Session Workspace
  roomOf: string
  modeScribeLabel: string
  modeScribeDesc: string
  modeOneWayLabel: string
  modeOneWayDesc: string
  modeTwoWayLabel: string
  modeTwoWayDesc: string
  openingWorkspace: string
  partnerLangLabel: string
  vietnameseLabel: string
  autoDetect: string
  fontSizeLabel: string
  displayControlsAria: string
  layoutGroupAria: string
  layoutStackedTitle: string
  layoutStackedAria: string
  layoutSplitTitle: string
  layoutSplitAria: string
  layoutFlippedTitle: string
  layoutFlippedAria: string
  dividerAria: string
  dividerTitle: string
  offlineNotice: string
  wakeLockNotice: string
  silenceWarningTitle: string
  silenceWarningDesc: string
  errorInitService: string
  errorStartSession: string
  errorStopSession: string
  statusRecording: string
  statusConnectingMic: string
  statusSaving: string
  statusError: string
  statusReady: string
  statusSubRecording: string
  statusSubReady: string
  startBtn: string
  connectingBtn: string
  savingBtn: string
  stopBtn: string
  partnerPanelTitle: string
  hostPanelTitle: string
  listeningStateActive: string
  listeningStateReady: string
  emptyActiveTitle: string
  emptyIdleTitle: string
  emptyActiveDesc: string
  emptyPartnerIdleDesc: string
  emptyHostIdleDesc: string
  speakerYou: string
  jumpLatest: string

  // History page
  historyTitle: string
  historySubtitle: string
  historyLoading: string
  historyEyebrow: string
  historyHeading: string
  historyDesc: string
  historySearchPlaceholder: string
  statConversations: string
  statFolders: string
  statDuration: string
  statPendingSync: string
  selectModeToggleAriaSelect: string
  selectModeToggleAriaExit: string
  selectModeCancel: string
  selectModeMulti: string
  selectToolbarSelected: string
  btnGroupFolder: string
  foldersSection: string
  foldersCount: string
  recentConversationsSection: string
  recentConversationsCount: string
  emptyConversationsTitle: string
  createFolderModalTitle: string
  folderNameLabel: string
  folderNamePlaceholder: string
  cancelBtn: string
  createBtn: string
  creatingBtn: string
  durationHoursMinutes: string
  durationMinutes: string
  syncStatusSynced: string
  syncStatusFailed: string
  syncStatusPending: string
  searchNoResults: string
  searchNoResultsDesc: string
  independentConversationsEmpty: string
  independentConversationsEmptyDesc: string
  createFolderGroupDesc: string
  createFolderPlaceholder: string
  closeAria: string
  searchResultsHeading: string
  selectConversationsHeading: string
  recentConversationsHeading: string
  itemsCount: string

  // History detail pages
  folderDetailHeaderTitle: string
  folderDetailBackLink: string
  folderDetailNotFoundTitle: string
  folderDetailNotFoundDesc: string
  folderDetailBackBtn: string
  folderDetailRenameAria: string
  folderDetailSaveNameAria: string
  folderDetailCancelNameAria: string
  folderDetailCreatedDate: string
  folderDetailConversationsCount: string
  folderDetailSummarizeBtn: string
  folderDetailDeleteBtn: string
  folderDetailDeleteConfirm: string
  folderDetailDeleteServerError: string
  folderDetailSessionsSectionTitle: string
  folderDetailSessionsSectionDesc: string
  folderDetailEmptyFolderTitle: string
  folderDetailEmptyFolderDesc: string
  folderDetailRemoveSessionAria: string
  folderDetailRemoveSessionConfirm: string
  sessionDetailHeaderTitle: string
  sessionDetailBackLink: string
  sessionDetailNotFoundTitle: string
  sessionDetailNotFoundDesc: string
  sessionDetailBackBtn: string
  sessionDetailRenameAria: string
  sessionDetailExportBtn: string
  sessionDetailExportPdf: string
  sessionDetailExportTxt: string
  sessionDetailExportJson: string
  sessionDetailSummarizeBtn: string
  sessionDetailDeleteBtn: string
  sessionDetailDeleteConfirm: string
  sessionDetailEmptyTranscriptTitle: string
  sessionDetailEmptyTranscriptDesc: string
  sessionDetailEditEntryAria: string
  sessionDetailOriginalLabel: string
  sessionDetailTranslatedLabel: string
  sessionDetailSaveEditBtn: string
  sessionDetailCancelEditBtn: string
  summaryModalHeaderTitle: string
  summaryModalAnalyzingTitle: string
  summaryModalAnalyzingDesc: string
  summaryModalStyleHeading: string
  summaryModalShareHeading: string
  summaryModalShareDesc: string
  summaryModalPasswordLabel: string
  summaryModalPasswordPlaceholder: string
  summaryModalCreateLinkBtn: string
  summaryModalCopyLinkAria: string
  summaryModalDownloadHtmlBtn: string
  summaryModalRetryBtn: string
  sessionDetailLoadError: string
  sessionDetailNameLabel: string
  sessionDetailSaveNameAria: string
  sessionDetailCancelNameAria: string
  sessionDetailDeleteServerError: string
  sessionDetailExportError: string
  sessionDetailTranscriptHeading: string
  sessionDetailEntriesCount: string
  sessionDetailSpeakerYou: string
  sessionDetailSpeakerPartner: string
  sessionDetailPreviewHeading: string
  sessionDetailPreviewDesc: string
  sessionDetailPreviewFrameTitle: string
  summaryModalGenerateError: string
  summaryModalServiceError: string
  summaryModalCreateLinkError: string
  summaryStyleDefault: string
  summaryStyleDefaultDesc: string
  summaryStyleFormal: string
  summaryStyleFormalDesc: string
  summaryStyleCasual: string
  summaryStyleCasualDesc: string
  summaryStyleVeryCasual: string
  summaryStyleVeryCasualDesc: string
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

    // Session Workspace
    roomOf: 'Phòng của {user}',
    modeScribeLabel: 'Ghi chú cuộc họp',
    modeScribeDesc: 'Ghi lời nói, không tạo bản dịch',
    modeOneWayLabel: 'Dịch 1 chiều',
    modeOneWayDesc: 'Tự nhận diện ngôn ngữ và dịch sang tiếng Việt',
    modeTwoWayLabel: 'Dịch 2 chiều',
    modeTwoWayDesc: 'Dịch qua lại giữa tiếng Việt và ngôn ngữ đã chọn',
    openingWorkspace: 'Đang mở bàn phiên dịch',
    partnerLangLabel: 'Ngôn ngữ đối tác',
    vietnameseLabel: 'Tiếng Việt',
    autoDetect: 'Tự động nhận diện',
    fontSizeLabel: 'Cỡ chữ',
    displayControlsAria: 'Thiết lập hiển thị',
    layoutGroupAria: 'Bố cục hội thoại',
    layoutStackedTitle: 'Xếp dọc',
    layoutStackedAria: 'Xếp hai khung theo chiều dọc',
    layoutSplitTitle: 'Song song',
    layoutSplitAria: 'Chia hai khung song song',
    layoutFlippedTitle: 'Đối diện qua bàn',
    layoutFlippedAria: 'Xoay khung đối tác 180 độ',
    dividerAria: 'Kéo để thay đổi độ rộng hai khung',
    dividerTitle: 'Kéo để thay đổi độ rộng',
    offlineNotice: 'Mất kết nối mạng. Bản ghi vẫn được lưu trên thiết bị và sẽ đồng bộ khi có mạng.',
    wakeLockNotice: 'Thiết bị có thể tự tắt màn hình. Hãy tăng thời gian chờ trong cài đặt hệ thống.',
    silenceWarningTitle: 'Sắp tự động dừng',
    silenceWarningDesc: 'Không có âm thanh trong 4 phút. Phiên sẽ dừng sau 1 phút nữa để tránh phát sinh chi phí.',
    errorInitService: 'Không thể khởi tạo dịch vụ phiên dịch.',
    errorStartSession: 'Không thể bắt đầu phiên. Vui lòng kiểm tra micro và thử lại.',
    errorStopSession: 'Kết nối âm thanh đã ngắt, nhưng dữ liệu trên máy vẫn được lưu.',
    statusRecording: 'Đang phiên dịch',
    statusConnectingMic: 'Đang kết nối micro',
    statusSaving: 'Đang lưu phiên',
    statusError: 'Lỗi kết nối',
    statusReady: 'Sẵn sàng',
    statusSubRecording: 'Âm thanh đang được xử lý trực tiếp',
    statusSubReady: 'Micro chỉ bật khi bạn bắt đầu',
    startBtn: 'Bắt đầu phiên dịch',
    connectingBtn: 'Đang kết nối',
    savingBtn: 'Đang lưu',
    stopBtn: 'Dừng và lưu phiên',
    partnerPanelTitle: 'Màn hình đối tác',
    hostPanelTitle: 'Màn hình của bạn',
    listeningStateActive: 'Đang nghe',
    listeningStateReady: 'Sẵn sàng',
    emptyActiveTitle: 'Đang chờ giọng nói',
    emptyIdleTitle: 'Chưa bắt đầu phiên dịch',
    emptyActiveDesc: 'Bản ghi sẽ xuất hiện ở đây ngay khi hệ thống nhận diện được lời nói.',
    emptyPartnerIdleDesc: 'Đặt màn hình hướng về phía người đối thoại.',
    emptyHostIdleDesc: 'Kiểm tra chế độ và ngôn ngữ trước khi bật micro.',
    speakerYou: 'Bạn',
    jumpLatest: 'Mới nhất',

    // History page
    historyTitle: 'Lịch sử hội thoại',
    historySubtitle: 'Dữ liệu của {user}',
    historyLoading: 'Đang đọc lịch sử trên thiết bị',
    historyEyebrow: 'Kho lưu trữ cục bộ',
    historyHeading: 'Cuộc hội thoại của bạn',
    historyDesc: 'Mở lại transcript, chỉnh sửa nội dung, xuất tài liệu hoặc tạo tóm tắt AI.',
    historySearchPlaceholder: 'Tìm hội thoại hoặc thư mục',
    statConversations: 'Hội thoại',
    statFolders: 'Thư mục',
    statDuration: 'Tổng thời lượng',
    statPendingSync: 'Chờ đồng bộ',
    selectModeToggleAriaSelect: 'Chọn nhiều hội thoại',
    selectModeToggleAriaExit: 'Thoát chế độ chọn',
    selectModeCancel: 'Hủy chọn',
    selectModeMulti: 'Chọn nhiều',
    selectToolbarSelected: 'Đã chọn {count} hội thoại',
    btnGroupFolder: 'Gom vào thư mục',
    foldersSection: 'Thư mục',
    foldersCount: '{count} thư mục',
    recentConversationsSection: 'Hội thoại gần đây',
    recentConversationsCount: '{count} hội thoại',
    emptyConversationsTitle: 'Chưa có cuộc hội thoại nào',
    createFolderModalTitle: 'Tạo thư mục mới',
    folderNameLabel: 'Tên thư mục',
    folderNamePlaceholder: 'Nhập tên thư mục...',
    cancelBtn: 'Hủy',
    createBtn: 'Tạo thư mục',
    creatingBtn: 'Đang tạo...',
    durationHoursMinutes: '{hours} giờ {minutes} phút',
    durationMinutes: '{minutes} phút',
    syncStatusSynced: 'Đã đồng bộ',
    syncStatusFailed: 'Lỗi đồng bộ',
    syncStatusPending: 'Đang chờ',
    searchNoResults: 'Không tìm thấy kết quả',
    searchNoResultsDesc: 'Thử một tên hoặc từ khóa khác.',
    independentConversationsEmpty: 'Chưa có hội thoại độc lập',
    independentConversationsEmptyDesc: 'Các phiên mới sẽ xuất hiện tại đây sau khi bạn dừng và lưu.',
    createFolderGroupDesc: 'Nhóm {count} hội thoại đã chọn.',
    createFolderPlaceholder: 'Ví dụ: Gặp khách hàng tháng 7',
    closeAria: 'Đóng',
    searchResultsHeading: 'Kết quả hội thoại',
    selectConversationsHeading: 'Chọn hội thoại',
    recentConversationsHeading: 'Hội thoại gần đây',
    itemsCount: '{count} mục',

    // History detail pages
    folderDetailHeaderTitle: 'Thư mục hội thoại',
    folderDetailBackLink: 'Lịch sử hội thoại',
    folderDetailNotFoundTitle: 'Không mở được thư mục',
    folderDetailNotFoundDesc: 'Dữ liệu không tồn tại trên thiết bị này.',
    folderDetailBackBtn: 'Trở về lịch sử',
    folderDetailRenameAria: 'Đổi tên thư mục',
    folderDetailSaveNameAria: 'Lưu tên',
    folderDetailCancelNameAria: 'Hủy đổi tên',
    folderDetailCreatedDate: 'Tạo {date}',
    folderDetailConversationsCount: '{count} hội thoại',
    folderDetailSummarizeBtn: 'Tóm tắt thư mục',
    folderDetailDeleteBtn: 'Xóa thư mục',
    folderDetailDeleteConfirm: 'Xóa thư mục? Các hội thoại bên trong sẽ được chuyển về danh sách chính.',
    folderDetailDeleteServerError: 'Chưa thể xóa thư mục trên máy chủ. Không có dữ liệu cục bộ nào bị thay đổi.',
    folderDetailSessionsSectionTitle: 'Hội thoại trong thư mục',
    folderDetailSessionsSectionDesc: 'Mở từng phiên để xem transcript và xuất tài liệu.',
    folderDetailEmptyFolderTitle: 'Thư mục đang trống',
    folderDetailEmptyFolderDesc: 'Chọn nhiều hội thoại từ trang lịch sử để thêm vào thư mục.',
    folderDetailRemoveSessionAria: 'Chuyển khỏi thư mục',
    folderDetailRemoveSessionConfirm: 'Chuyển hội thoại này ra khỏi thư mục?',
    sessionDetailHeaderTitle: 'Chi tiết phiên dịch',
    sessionDetailBackLink: 'Lịch sử hội thoại',
    sessionDetailNotFoundTitle: 'Không tìm thấy hội thoại',
    sessionDetailNotFoundDesc: 'Dữ liệu này không tồn tại trên thiết bị hiện tại.',
    sessionDetailBackBtn: 'Trở về lịch sử',
    sessionDetailRenameAria: 'Đổi tên hội thoại',
    sessionDetailExportBtn: 'Xuất tài liệu',
    sessionDetailExportPdf: 'Tải tệp PDF (.pdf)',
    sessionDetailExportTxt: 'Tải tệp văn bản (.txt)',
    sessionDetailExportJson: 'Tải tệp JSON (.json)',
    sessionDetailSummarizeBtn: 'Tóm tắt AI',
    sessionDetailDeleteBtn: 'Xóa hội thoại',
    sessionDetailDeleteConfirm: 'Xóa vĩnh viễn hội thoại và toàn bộ transcript?',
    sessionDetailEmptyTranscriptTitle: 'Chưa có bản ghi transcript',
    sessionDetailEmptyTranscriptDesc: 'Phiên dịch này kết thúc mà không phát sinh nội dung thoại.',
    sessionDetailEditEntryAria: 'Sửa đoạn hội thoại',
    sessionDetailOriginalLabel: 'Văn bản gốc',
    sessionDetailTranslatedLabel: 'Bản dịch',
    sessionDetailSaveEditBtn: 'Lưu thay đổi',
    sessionDetailCancelEditBtn: 'Hủy',
    summaryModalHeaderTitle: 'Bản tóm tắt',
    summaryModalAnalyzingTitle: 'Đang phân tích các hội thoại',
    summaryModalAnalyzingDesc: 'Thời gian xử lý phụ thuộc tổng độ dài transcript.',
    summaryModalStyleHeading: 'Phong cách trình bày',
    summaryModalShareHeading: 'Chia sẻ bảo mật',
    summaryModalShareDesc: 'Mật khẩu là tùy chọn và được lưu dưới dạng dẫn xuất một chiều.',
    summaryModalPasswordLabel: 'Mật khẩu truy cập',
    summaryModalPasswordPlaceholder: 'Để trống nếu không cần',
    summaryModalCreateLinkBtn: 'Tạo liên kết',
    summaryModalCopyLinkAria: 'Sao chép liên kết',
    summaryModalDownloadHtmlBtn: 'Tải HTML',
    summaryModalRetryBtn: 'Thử lại',
    sessionDetailLoadError: 'Không thể tải dữ liệu hội thoại. Hãy kiểm tra kết nối và thử lại.',
    sessionDetailNameLabel: 'Tên hội thoại',
    sessionDetailSaveNameAria: 'Lưu tên',
    sessionDetailCancelNameAria: 'Hủy đổi tên',
    sessionDetailDeleteServerError: 'Chưa thể xóa hội thoại trên máy chủ. Dữ liệu trên thiết bị vẫn được giữ nguyên.',
    sessionDetailExportError: 'Không thể tạo tệp xuất. Vui lòng thử lại.',
    sessionDetailTranscriptHeading: 'Transcript',
    sessionDetailEntriesCount: '{count} đoạn hội thoại đã lưu',
    sessionDetailSpeakerYou: 'Bạn nói',
    sessionDetailSpeakerPartner: '{name} nói',
    sessionDetailPreviewHeading: 'Bản xem trước',
    sessionDetailPreviewDesc: 'Báo cáo HTML từ nội dung tóm tắt',
    sessionDetailPreviewFrameTitle: 'Xem trước báo cáo tóm tắt',
    summaryModalGenerateError: 'Không thể tạo bản tóm tắt.',
    summaryModalServiceError: 'Không thể kết nối dịch vụ tóm tắt.',
    summaryModalCreateLinkError: 'Không thể tạo liên kết chia sẻ.',
    summaryStyleDefault: 'Mặc định',
    summaryStyleDefaultDesc: 'Tự nhiên và rõ ràng',
    summaryStyleFormal: 'Trang trọng',
    summaryStyleFormalDesc: 'Chuẩn văn bản doanh nghiệp',
    summaryStyleCasual: 'Thân mật',
    summaryStyleCasualDesc: 'Gần gũi, dễ đọc',
    summaryStyleVeryCasual: 'Ghi chú nhanh',
    summaryStyleVeryCasualDesc: 'Ngắn gọn, trực tiếp',
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

    // Session Workspace
    roomOf: "{user}'s Room",
    modeScribeLabel: 'Meeting Notes',
    modeScribeDesc: 'Transcribe speech, no translation',
    modeOneWayLabel: '1-Way Translation',
    modeOneWayDesc: 'Auto-detect language and translate to Vietnamese',
    modeTwoWayLabel: '2-Way Translation',
    modeTwoWayDesc: 'Bidirectional translation between Vietnamese & partner',
    openingWorkspace: 'Opening interpreter workspace...',
    partnerLangLabel: 'Partner Language',
    vietnameseLabel: 'Vietnamese',
    autoDetect: 'Auto Detect',
    fontSizeLabel: 'Font Size',
    displayControlsAria: 'Display settings',
    layoutGroupAria: 'Conversation layout',
    layoutStackedTitle: 'Stacked',
    layoutStackedAria: 'Stack panels vertically',
    layoutSplitTitle: 'Side by side',
    layoutSplitAria: 'Display panels side by side',
    layoutFlippedTitle: 'Face to face',
    layoutFlippedAria: 'Rotate partner panel 180 degrees',
    dividerAria: 'Drag to resize panel widths',
    dividerTitle: 'Drag to resize',
    offlineNotice: 'Network disconnected. Records are saved locally and will sync when reconnected.',
    wakeLockNotice: 'Device may sleep automatically. Consider extending screen timeout in system settings.',
    silenceWarningTitle: 'Auto-stop warning',
    silenceWarningDesc: 'No speech detected for 4 minutes. Session will stop in 1 minute to avoid unnecessary charges.',
    errorInitService: 'Failed to initialize interpreter service.',
    errorStartSession: 'Failed to start session. Please check your microphone and try again.',
    errorStopSession: 'Audio connection closed, but local transcript has been saved.',
    statusRecording: 'Live Interpreting',
    statusConnectingMic: 'Connecting microphone...',
    statusSaving: 'Saving session...',
    statusError: 'Connection error',
    statusReady: 'Ready',
    statusSubRecording: 'Audio is being processed live',
    statusSubReady: 'Microphone activates only when you start',
    startBtn: 'Start Session',
    connectingBtn: 'Connecting...',
    savingBtn: 'Saving...',
    stopBtn: 'Stop & Save',
    partnerPanelTitle: 'Partner Screen',
    hostPanelTitle: 'Your Screen',
    listeningStateActive: 'Listening',
    listeningStateReady: 'Ready',
    emptyActiveTitle: 'Waiting for speech...',
    emptyIdleTitle: 'Session not started',
    emptyActiveDesc: 'Transcripts will appear here as soon as speech is detected.',
    emptyPartnerIdleDesc: 'Position this screen facing your conversation partner.',
    emptyHostIdleDesc: 'Check mode and language settings before turning on the microphone.',
    speakerYou: 'You',
    jumpLatest: 'Latest',

    // History page
    historyTitle: 'Conversation History',
    historySubtitle: 'Data of {user}',
    historyLoading: 'Loading history from device...',
    historyEyebrow: 'Local Storage',
    historyHeading: 'Your Conversations',
    historyDesc: 'Reopen transcripts, edit content, export documents, or generate AI summaries.',
    historySearchPlaceholder: 'Search conversations or folders',
    statConversations: 'Conversations',
    statFolders: 'Folders',
    statDuration: 'Total Duration',
    statPendingSync: 'Pending Sync',
    selectModeToggleAriaSelect: 'Select multiple conversations',
    selectModeToggleAriaExit: 'Exit selection mode',
    selectModeCancel: 'Cancel selection',
    selectModeMulti: 'Select multiple',
    selectToolbarSelected: 'Selected {count} conversations',
    btnGroupFolder: 'Group into folder',
    foldersSection: 'Folders',
    foldersCount: '{count} folders',
    recentConversationsSection: 'Recent Conversations',
    recentConversationsCount: '{count} conversations',
    emptyConversationsTitle: 'No conversations yet',
    createFolderModalTitle: 'Create New Folder',
    folderNameLabel: 'Folder name',
    folderNamePlaceholder: 'Enter folder name...',
    cancelBtn: 'Cancel',
    createBtn: 'Create Folder',
    creatingBtn: 'Creating...',
    durationHoursMinutes: '{hours}h {minutes}m',
    durationMinutes: '{minutes}m',
    syncStatusSynced: 'Synced',
    syncStatusFailed: 'Sync failed',
    syncStatusPending: 'Pending',
    searchNoResults: 'No results found',
    searchNoResultsDesc: 'Try a different name or keyword.',
    independentConversationsEmpty: 'No independent conversations',
    independentConversationsEmptyDesc: 'New sessions will appear here after you stop and save.',
    createFolderGroupDesc: 'Group {count} selected conversations.',
    createFolderPlaceholder: 'E.g., Client meeting July',
    closeAria: 'Close',
    searchResultsHeading: 'Search Results',
    selectConversationsHeading: 'Select Conversations',
    recentConversationsHeading: 'Recent Conversations',
    itemsCount: '{count} items',

    // History detail pages
    folderDetailHeaderTitle: 'Conversation Folder',
    folderDetailBackLink: 'Conversation History',
    folderDetailNotFoundTitle: 'Folder Not Found',
    folderDetailNotFoundDesc: 'Data does not exist on this device.',
    folderDetailBackBtn: 'Back to History',
    folderDetailRenameAria: 'Rename folder',
    folderDetailSaveNameAria: 'Save name',
    folderDetailCancelNameAria: 'Cancel rename',
    folderDetailCreatedDate: 'Created {date}',
    folderDetailConversationsCount: '{count} conversations',
    folderDetailSummarizeBtn: 'Summarize Folder',
    folderDetailDeleteBtn: 'Delete Folder',
    folderDetailDeleteConfirm: 'Delete folder? Conversations inside will be moved back to the main list.',
    folderDetailDeleteServerError: 'Could not delete folder on server. Local data remains unchanged.',
    folderDetailSessionsSectionTitle: 'Conversations in Folder',
    folderDetailSessionsSectionDesc: 'Open each session to view transcripts and export documents.',
    folderDetailEmptyFolderTitle: 'Folder is empty',
    folderDetailEmptyFolderDesc: 'Select multiple conversations from the history page to add to this folder.',
    folderDetailRemoveSessionAria: 'Remove from folder',
    folderDetailRemoveSessionConfirm: 'Remove this conversation from folder?',
    sessionDetailHeaderTitle: 'Session Details',
    sessionDetailBackLink: 'Conversation History',
    sessionDetailNotFoundTitle: 'Conversation Not Found',
    sessionDetailNotFoundDesc: 'This conversation does not exist on this device.',
    sessionDetailBackBtn: 'Back to History',
    sessionDetailRenameAria: 'Rename conversation',
    sessionDetailExportBtn: 'Export Document',
    sessionDetailExportPdf: 'Download PDF (.pdf)',
    sessionDetailExportTxt: 'Download Text (.txt)',
    sessionDetailExportJson: 'Download JSON (.json)',
    sessionDetailSummarizeBtn: 'AI Summary',
    sessionDetailDeleteBtn: 'Delete Conversation',
    sessionDetailDeleteConfirm: 'Permanently delete this conversation and all transcripts?',
    sessionDetailEmptyTranscriptTitle: 'No transcript entries yet',
    sessionDetailEmptyTranscriptDesc: 'This session ended with no recorded speech.',
    sessionDetailEditEntryAria: 'Edit message',
    sessionDetailOriginalLabel: 'Original text',
    sessionDetailTranslatedLabel: 'Translation',
    sessionDetailSaveEditBtn: 'Save changes',
    sessionDetailCancelEditBtn: 'Cancel',
    summaryModalHeaderTitle: 'Summary Report',
    summaryModalAnalyzingTitle: 'Analyzing conversations',
    summaryModalAnalyzingDesc: 'Processing time depends on total transcript length.',
    summaryModalStyleHeading: 'Summary Style',
    summaryModalShareHeading: 'Secure Sharing',
    summaryModalShareDesc: 'Password is optional and stored as a one-way hash.',
    summaryModalPasswordLabel: 'Access Password',
    summaryModalPasswordPlaceholder: 'Leave blank if not needed',
    summaryModalCreateLinkBtn: 'Create Link',
    summaryModalCopyLinkAria: 'Copy link',
    summaryModalDownloadHtmlBtn: 'Download HTML',
    summaryModalRetryBtn: 'Retry',
    sessionDetailLoadError: 'Failed to load conversation data. Please check your connection and try again.',
    sessionDetailNameLabel: 'Conversation name',
    sessionDetailSaveNameAria: 'Save name',
    sessionDetailCancelNameAria: 'Cancel rename',
    sessionDetailDeleteServerError: 'Could not delete conversation on server. Local device data is preserved.',
    sessionDetailExportError: 'Failed to generate export file. Please try again.',
    sessionDetailTranscriptHeading: 'Transcript',
    sessionDetailEntriesCount: '{count} saved dialogue entries',
    sessionDetailSpeakerYou: 'You said',
    sessionDetailSpeakerPartner: '{name} said',
    sessionDetailPreviewHeading: 'Preview',
    sessionDetailPreviewDesc: 'HTML report generated from summary',
    sessionDetailPreviewFrameTitle: 'Summary Report Preview',
    summaryModalGenerateError: 'Could not generate summary.',
    summaryModalServiceError: 'Could not connect to summary service.',
    summaryModalCreateLinkError: 'Could not create share link.',
    summaryStyleDefault: 'Default',
    summaryStyleDefaultDesc: 'Natural and clear',
    summaryStyleFormal: 'Formal',
    summaryStyleFormalDesc: 'Standard business style',
    summaryStyleCasual: 'Casual',
    summaryStyleCasualDesc: 'Conversational and readable',
    summaryStyleVeryCasual: 'Quick Notes',
    summaryStyleVeryCasualDesc: 'Brief and direct',
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

    // Session Workspace
    roomOf: '{user} 的同传室',
    modeScribeLabel: '会议纪要',
    modeScribeDesc: '仅转录语音，不生成翻译',
    modeOneWayLabel: '单向同传',
    modeOneWayDesc: '自动识别语言并翻译成越南语',
    modeTwoWayLabel: '双向同传',
    modeTwoWayDesc: '在越南语与所选语言之间双向互译',
    openingWorkspace: '正在打开同传工作区...',
    partnerLangLabel: '对方语言',
    vietnameseLabel: '越南语',
    autoDetect: '自动识别',
    fontSizeLabel: '字号',
    displayControlsAria: '显示设置',
    layoutGroupAria: '对话布局',
    layoutStackedTitle: '垂直排列',
    layoutStackedAria: '垂直排列两个面板',
    layoutSplitTitle: '并排显示',
    layoutSplitAria: '并排显示两个面板',
    layoutFlippedTitle: '面对面',
    layoutFlippedAria: '对方屏幕旋转 180 度',
    dividerAria: '拖动以调整宽度',
    dividerTitle: '拖动调整大小',
    offlineNotice: '网络连接断开。记录已保存在本地，恢复网络后将自动同步。',
    wakeLockNotice: '设备可能会自动息屏。请在系统设置中延长屏幕常亮时间。',
    silenceWarningTitle: '即将自动停止',
    silenceWarningDesc: '已 4 分钟未检测到声音。为避免产生不必要的费用，同传将在 1 分钟后停止。',
    errorInitService: '无法初始化同传服务。',
    errorStartSession: '无法开始同传，请检查麦克风并重试。',
    errorStopSession: '音频连接已断开，但本地记录已保存。',
    statusRecording: '正在同传',
    statusConnectingMic: '正在连接麦克风...',
    statusSaving: '正在保存会话...',
    statusError: '连接错误',
    statusReady: '就绪',
    statusSubRecording: '音频正在实时处理',
    statusSubReady: '仅在点击开始后开启麦克风',
    startBtn: '开始同传',
    connectingBtn: '正在连接...',
    savingBtn: '正在保存...',
    stopBtn: '停止并保存',
    partnerPanelTitle: '对方屏幕',
    hostPanelTitle: '您的屏幕',
    listeningStateActive: '正在聆听',
    listeningStateReady: '就绪',
    emptyActiveTitle: '等待语音输入...',
    emptyIdleTitle: '未开始同传',
    emptyActiveDesc: '一旦检测到语音，转录内容将立即显示在此处。',
    emptyPartnerIdleDesc: '将此屏幕朝向对方。',
    emptyHostIdleDesc: '开启麦克风前请检查模式与语言。',
    speakerYou: '您',
    jumpLatest: '最新',

    // History page
    historyTitle: '对话历史',
    historySubtitle: '{user} 的数据',
    historyLoading: '正在读取本地历史记录...',
    historyEyebrow: '本地存储',
    historyHeading: '您的对话记录',
    historyDesc: '重新查看转录记录、编辑内容、导出文档或生成 AI 摘要。',
    historySearchPlaceholder: '搜索对话或文件夹',
    statConversations: '对话',
    statFolders: '文件夹',
    statDuration: '总时长',
    statPendingSync: '等待同步',
    selectModeToggleAriaSelect: '批量选择对话',
    selectModeToggleAriaExit: '退出选择模式',
    selectModeCancel: '取消选择',
    selectModeMulti: '批量选择',
    selectToolbarSelected: '已选择 {count} 个对话',
    btnGroupFolder: '移至文件夹',
    foldersSection: '文件夹',
    foldersCount: '{count} 个文件夹',
    recentConversationsSection: '最近对话',
    recentConversationsCount: '{count} 个对话',
    emptyConversationsTitle: '暂无对话记录',
    createFolderModalTitle: '创建新文件夹',
    folderNameLabel: '文件夹名称',
    folderNamePlaceholder: '输入文件夹名称...',
    cancelBtn: '取消',
    createBtn: '创建文件夹',
    creatingBtn: '正在创建...',
    durationHoursMinutes: '{hours} 小时 {minutes} 分钟',
    durationMinutes: '{minutes} 分钟',
    syncStatusSynced: '已同步',
    syncStatusFailed: '同步失败',
    syncStatusPending: '等待同步',
    searchNoResults: '未找到相关结果',
    searchNoResultsDesc: '请尝试其他名称或关键词。',
    independentConversationsEmpty: '暂无独立会话',
    independentConversationsEmptyDesc: '停止并保存后，新会话将显示在此处。',
    createFolderGroupDesc: '将选中的 {count} 个对话分组。',
    createFolderPlaceholder: '例如：7月客户洽谈',
    closeAria: '关闭',
    searchResultsHeading: '搜索结果',
    selectConversationsHeading: '选择对话',
    recentConversationsHeading: '最近对话',
    itemsCount: '{count} 项',

    // History detail pages
    folderDetailHeaderTitle: '对话文件夹',
    folderDetailBackLink: '对话历史',
    folderDetailNotFoundTitle: '无法打开文件夹',
    folderDetailNotFoundDesc: '此设备上不存在该数据。',
    folderDetailBackBtn: '返回历史记录',
    folderDetailRenameAria: '重命名文件夹',
    folderDetailSaveNameAria: '保存名称',
    folderDetailCancelNameAria: '取消重命名',
    folderDetailCreatedDate: '创建于 {date}',
    folderDetailConversationsCount: '{count} 个对话',
    folderDetailSummarizeBtn: '总结文件夹',
    folderDetailDeleteBtn: '删除文件夹',
    folderDetailDeleteConfirm: '删除文件夹？其中的对话将移回主列表。',
    folderDetailDeleteServerError: '无法在服务器上删除文件夹。本地数据未更改。',
    folderDetailSessionsSectionTitle: '文件夹内的对话',
    folderDetailSessionsSectionDesc: '打开每个会话以查看转录并导出文档。',
    folderDetailEmptyFolderTitle: '文件夹为空',
    folderDetailEmptyFolderDesc: '从历史记录页面选择多个对话以添加到此文件夹。',
    folderDetailRemoveSessionAria: '移出文件夹',
    folderDetailRemoveSessionConfirm: '将此会话移出文件夹？',
    sessionDetailHeaderTitle: '同传详情',
    sessionDetailBackLink: '对话历史',
    sessionDetailNotFoundTitle: '未找到对话',
    sessionDetailNotFoundDesc: '当前设备上不存在此数据。',
    sessionDetailBackBtn: '返回历史记录',
    sessionDetailRenameAria: '重命名对话',
    sessionDetailExportBtn: '导出文档',
    sessionDetailExportPdf: '下载 PDF (.pdf)',
    sessionDetailExportTxt: '下载文本 (.txt)',
    sessionDetailExportJson: '下载 JSON (.json)',
    sessionDetailSummarizeBtn: 'AI 总结',
    sessionDetailDeleteBtn: '删除对话',
    sessionDetailDeleteConfirm: '永久删除此对话及所有转录内容？',
    sessionDetailEmptyTranscriptTitle: '暂无转录记录',
    sessionDetailEmptyTranscriptDesc: '此会话结束时未录制到语音。',
    sessionDetailEditEntryAria: '编辑消息',
    sessionDetailOriginalLabel: '原文',
    sessionDetailTranslatedLabel: '译文',
    sessionDetailSaveEditBtn: '保存更改',
    sessionDetailCancelEditBtn: '取消',
    summaryModalHeaderTitle: '总结报告',
    summaryModalAnalyzingTitle: '正在分析对话',
    summaryModalAnalyzingDesc: '处理时间取决于转录总长度。',
    summaryModalStyleHeading: '呈现风格',
    summaryModalShareHeading: '安全分享',
    summaryModalShareDesc: '密码为选填项，并以单向哈希形式存储。',
    summaryModalPasswordLabel: '访问密码',
    summaryModalPasswordPlaceholder: '如不需要请留空',
    summaryModalCreateLinkBtn: '生成链接',
    summaryModalCopyLinkAria: '复制链接',
    summaryModalDownloadHtmlBtn: '下载 HTML',
    summaryModalRetryBtn: '重试',
    sessionDetailLoadError: '无法加载对话数据。请检查网络连接后重试。',
    sessionDetailNameLabel: '对话名称',
    sessionDetailSaveNameAria: '保存名称',
    sessionDetailCancelNameAria: '取消重命名',
    sessionDetailDeleteServerError: '无法在服务器上删除对话。本地设备数据已保留。',
    sessionDetailExportError: '无法生成导出文件。请重试。',
    sessionDetailTranscriptHeading: '对话记录',
    sessionDetailEntriesCount: '{count} 条已保存对话',
    sessionDetailSpeakerYou: '您说',
    sessionDetailSpeakerPartner: '{name} 说',
    sessionDetailPreviewHeading: '预览',
    sessionDetailPreviewDesc: '根据摘要生成的 HTML 报告',
    sessionDetailPreviewFrameTitle: '摘要报告预览',
    summaryModalGenerateError: '无法生成摘要。',
    summaryModalServiceError: '无法连接到摘要服务。',
    summaryModalCreateLinkError: '无法创建分享链接。',
    summaryStyleDefault: '默认',
    summaryStyleDefaultDesc: '自然清晰',
    summaryStyleFormal: '正式',
    summaryStyleFormalDesc: '标准商务风格',
    summaryStyleCasual: '日常',
    summaryStyleCasualDesc: '亲和易读',
    summaryStyleVeryCasual: '速记笔记',
    summaryStyleVeryCasualDesc: '简短直接',
  },
}

export function detectMachineLanguage(): Language {
  if (typeof window === 'undefined') return 'vi'

  const nav = navigator as unknown as { userLanguage?: string }
  const navLang = (
    navigator.languages?.[0] ||
    navigator.language ||
    nav.userLanguage ||
    ''
  ).toLowerCase()

  if (navLang.startsWith('zh')) return 'zh'
  if (navLang.startsWith('en')) return 'en'
  if (navLang.startsWith('vi')) return 'vi'

  return 'en'
}

export interface EmailTemplateStrings {
  subject: (otp: string) => string
  tagline: string
  greeting: (email: string) => string
  otpTitle: string
  directLinkText: string
  signInBtn: string
  expiryNotice: string
}

export const emailTranslations: Record<Language, EmailTemplateStrings> = {
  vi: {
    subject: (otp) => `Mã OTP PayLingo: ${otp}`,
    tagline: 'Phiên dịch thời gian thực & Quản lý hội thoại',
    greeting: (email) => `Chào bạn, chúng tôi đã nhận được yêu cầu đăng nhập vào tài khoản <strong>${email}</strong>.`,
    otpTitle: 'Mã xác thực OTP',
    directLinkText: 'Hoặc bấm vào nút bên dưới để đăng nhập trực tiếp:',
    signInBtn: 'Đăng nhập vào PayLingo',
    expiryNotice: 'Mã OTP và liên kết có hiệu lực trong 15 phút. Nếu bạn không yêu cầu mã này, vui lòng bỏ qua email.',
  },
  en: {
    subject: (otp) => `PayLingo OTP Code: ${otp}`,
    tagline: 'Real-time Interpretation & Session Management',
    greeting: (email) => `Hello, we received a login request for your account <strong>${email}</strong>.`,
    otpTitle: 'OTP Verification Code',
    directLinkText: 'Or click the button below to sign in directly:',
    signInBtn: 'Sign In to PayLingo',
    expiryNotice: 'The OTP code and link are valid for 15 minutes. If you did not request this, please ignore this email.',
  },
  zh: {
    subject: (otp) => `PayLingo 登录验证码: ${otp}`,
    tagline: '实时同声传译与会话管理',
    greeting: (email) => `您好，我们收到了您账号 <strong>${email}</strong> 的登录请求。`,
    otpTitle: '登录验证码 (OTP)',
    directLinkText: '或点击下方按钮直接登录：',
    signInBtn: '登录 PayLingo',
    expiryNotice: '验证码和登录链接有效时间为 15 分钟。如果您未请求此操作，请忽略此邮件。',
  },
}
