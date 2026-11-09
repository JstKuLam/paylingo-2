import SwiftUI
import UIKit
import shared

struct PartnerLanguageItem: Identifiable {
    var id: String { code }
    let code: String
    let shortCode: String
    let name: String
}

let PARTNER_LANGUAGE_ITEMS: [PartnerLanguageItem] = [
    PartnerLanguageItem(code: "any", shortCode: "AUTO", name: "Tự nhận diện (Auto Detect)"),
    PartnerLanguageItem(code: "en", shortCode: "EN", name: "English"),
    PartnerLanguageItem(code: "zh", shortCode: "ZH", name: "中文 (Chinese)"),
    PartnerLanguageItem(code: "ja", shortCode: "JA", name: "日本語 (Japanese)"),
    PartnerLanguageItem(code: "ko", shortCode: "KO", name: "한국어 (Korean)"),
    PartnerLanguageItem(code: "es", shortCode: "ES", name: "Español"),
    PartnerLanguageItem(code: "ru", shortCode: "RU", name: "Русский"),
    PartnerLanguageItem(code: "de", shortCode: "DE", name: "Deutsch"),
    PartnerLanguageItem(code: "th", shortCode: "TH", name: "ภาษาไทย")
]

func formatDurationSeconds(_ seconds: Int32) -> String {
    let mins = seconds / 60
    let secs = seconds % 60
    return String(format: "%02d:%02d", mins, secs)
}

func formatEpochMs(_ ms: Int64) -> String {
    let date = Date(timeIntervalSince1970: TimeInterval(ms) / 1000.0)
    let formatter = DateFormatter()
    formatter.dateFormat = "dd/MM HH:mm"
    return formatter.string(from: date)
}

struct ContentView: View {
    @StateObject private var viewModelHelper: ViewModelHelper = {
        let driverFactory = DatabaseDriverFactory()
        let repository = SessionRepository(databaseDriverFactory: driverFactory)
        let audioRecorder = IosAudioRecorder()
        let viewModel = SessionViewModel(
            audioRecorder: audioRecorder,
            repository: repository,
            apiKey: ""
        )
        return ViewModelHelper(viewModel: viewModel)
    }()

    var body: some View {
        let state = viewModelHelper.state
        let isDark = state.themeMode == "dark"

        Group {
            if state.needsUpdate {
                UpdateOverlayView(updateUrl: state.updateUrl)
            } else if !state.isOnboarded {
                IosOnboardingView(
                    initialName: state.userName,
                    initialKey: state.sonioxApiKey,
                    isDark: isDark,
                    onToggleTheme: { viewModelHelper.toggleTheme() },
                    onContinue: { name, key in viewModelHelper.saveProfile(name: name, apiKey: key) }
                )
            } else if state.activeScreen == "history" {
                IosHistoryView(helper: viewModelHelper, state: state, isDark: isDark)
            } else {
                IosInterpreterView(helper: viewModelHelper, state: state, isDark: isDark)
            }
        }
        .preferredColorScheme(isDark ? .dark : .light)
        .onAppear {
            UIApplication.shared.isIdleTimerDisabled = state.isRecording || state.isConnecting
        }
        .onChange(of: state.isRecording || state.isConnecting) { keepAwake in
            UIApplication.shared.isIdleTimerDisabled = keepAwake
        }
        .onDisappear {
            UIApplication.shared.isIdleTimerDisabled = false
        }
    }
}

struct IosOnboardingView: View {
    let initialName: String
    let initialKey: String
    let isDark: Bool
    let onToggleTheme: () -> Void
    let onContinue: (String, String) -> Void

    @State private var name: String = ""
    @State private var apiKey: String = ""
    @State private var showKey: Bool = false
    @State private var errorMsg: String? = nil

    var body: some View {
        let bg = isDark ? Color(red: 11/255, green: 14/255, blue: 20/255) : Color(red: 244/255, green: 246/255, blue: 250/255)
        let cardBg = isDark ? Color(red: 19/255, green: 24/255, blue: 34/255) : Color.white

        ZStack {
            bg.ignoresSafeArea()

            VStack {
                HStack {
                    HStack(spacing: 8) {
                        RoundedRectangle(cornerRadius: 9)
                            .fill(Color.blue)
                            .frame(width: 32, height: 32)
                            .overlay(
                                Image(systemName: "bubble.left.and.bubble.right.fill")
                                    .font(.system(size: 14, weight: .bold))
                                    .foregroundColor(.white)
                            )
                        Text("PayLingo")
                            .font(.system(size: 17, weight: .bold))
                    }
                    Spacer()
                    Button(action: onToggleTheme) {
                        Image(systemName: isDark ? "sun.max.fill" : "moon.fill")
                            .font(.system(size: 16))
                            .foregroundColor(.secondary)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 12)

                Spacer()

                VStack(spacing: 16) {
                    RoundedRectangle(cornerRadius: 14)
                        .fill(Color.blue.opacity(0.15))
                        .frame(width: 48, height: 48)
                        .overlay(
                            Image(systemName: "waveform.and.mic")
                                .font(.system(size: 22, weight: .bold))
                                .foregroundColor(.blue)
                        )

                    Text("Bắt đầu phiên dịch")
                        .font(.system(size: 20, weight: .bold))

                    Text("Nhập tên của bạn và Soniox API Key cá nhân để sử dụng trực tiếp.")
                        .font(.system(size: 13))
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)

                    VStack(alignment: .leading, spacing: 6) {
                        Text("Tên của bạn")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.secondary)
                        TextField("VD: Minh Anh", text: $name)
                            .textFieldStyle(RoundedBorderTextFieldStyle())
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text("Soniox API Key")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(.secondary)
                            Spacer()
                            if let url = URL(string: "https://console.soniox.com") {
                                Link("Lấy API Key ↗", destination: url)
                                    .font(.system(size: 12, weight: .semibold))
                            }
                        }

                        HStack {
                            if showKey {
                                TextField("Dán Soniox API Key của bạn...", text: $apiKey)
                                    .textFieldStyle(RoundedBorderTextFieldStyle())
                            } else {
                                SecureField("Dán Soniox API Key của bạn...", text: $apiKey)
                                    .textFieldStyle(RoundedBorderTextFieldStyle())
                            }
                            Button(action: { showKey.toggle() }) {
                                Image(systemName: showKey ? "eye.slash" : "eye")
                                    .foregroundColor(.secondary)
                            }
                        }

                        Text("Key chỉ lưu trên thiết bị của bạn và kết nối thẳng tới Soniox.")
                            .font(.system(size: 11))
                            .foregroundColor(.secondary)
                    }

                    if let err = errorMsg {
                        Text(err)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.red)
                    }

                    Button(action: {
                        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
                        let cleanKey = apiKey.trimmingCharacters(in: .whitespacesAndNewlines)
                        if cleanName.isEmpty {
                            errorMsg = "Vui lòng nhập tên của bạn."
                        } else {
                            onContinue(cleanName, cleanKey)
                        }
                    }) {
                        Text("Bắt đầu phiên dịch")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity, minHeight: 46)
                            .background(Color.blue)
                            .cornerRadius(23)
                    }
                }
                .padding(24)
                .background(cardBg)
                .cornerRadius(24)
                .padding(.horizontal, 20)

                Spacer()
            }
        }
        .onAppear {
            name = initialName
            apiKey = initialKey
        }
    }
}

struct IosInterpreterView: View {
    let helper: ViewModelHelper
    let state: SessionState
    let isDark: Bool

    @State private var showLanguageSheet = false
    @State private var showApiKeySheet = false
    @State private var showProfileSheet = false

    var selectedPartner: PartnerLanguageItem {
        PARTNER_LANGUAGE_ITEMS.first(where: { $0.code == state.partnerLang }) ?? PARTNER_LANGUAGE_ITEMS[1]
    }

    var availableLanguages: [PartnerLanguageItem] {
        if state.recordingMode == "two_way" {
            return PARTNER_LANGUAGE_ITEMS.filter { $0.code != "any" }
        }
        return PARTNER_LANGUAGE_ITEMS
    }

    var body: some View {
        let bg = isDark ? Color(red: 11/255, green: 14/255, blue: 20/255) : Color(red: 244/255, green: 246/255, blue: 250/255)
        let surface = isDark ? Color(red: 19/255, green: 24/255, blue: 34/255) : Color.white
        let fontScale = CGFloat(state.fontSize) / 100.0

        ZStack {
            bg.ignoresSafeArea()

            VStack(spacing: 0) {
                // TOP BAR
                VStack(spacing: 8) {
                    // Row 1: Brand + Actions
                    HStack {
                        HStack(spacing: 8) {
                            RoundedRectangle(cornerRadius: 8)
                                .fill(Color.blue)
                                .frame(width: 28, height: 28)
                                .overlay(
                                    Image(systemName: "bubble.left.and.bubble.right.fill")
                                        .font(.system(size: 12, weight: .bold))
                                        .foregroundColor(.white)
                                )
                            Text("PayLingo")
                                .font(.system(size: 15, weight: .bold))
                        }

                        Spacer()

                        HStack(spacing: 6) {
                            Button(action: { showApiKeySheet = true }) {
                                HStack(spacing: 4) {
                                    Image(systemName: "key.fill")
                                        .font(.system(size: 11))
                                        .foregroundColor(state.sonioxApiKey.isEmpty ? .orange : .green)
                                    Text("API Key")
                                        .font(.system(size: 11, weight: .semibold))
                                }
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(Color.secondary.opacity(0.14))
                                .cornerRadius(14)
                            }
                            .disabled(state.isRecording)

                            Button(action: { helper.setScreen(screen: "history") }) {
                                HStack(spacing: 4) {
                                    Image(systemName: "clock.arrow.circlepath")
                                        .font(.system(size: 11))
                                    Text("Lịch sử")
                                        .font(.system(size: 11, weight: .semibold))
                                }
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(Color.secondary.opacity(0.14))
                                .cornerRadius(14)
                            }
                            .disabled(state.isRecording)

                            Button(action: { helper.toggleTheme() }) {
                                Image(systemName: isDark ? "sun.max.fill" : "moon.fill")
                                    .font(.system(size: 13))
                                    .frame(width: 28, height: 28)
                                    .background(Color.secondary.opacity(0.14))
                                    .clipShape(Circle())
                            }

                            Button(action: { showProfileSheet = true }) {
                                HStack(spacing: 5) {
                                    Circle()
                                        .fill(Color.blue)
                                        .frame(width: 20, height: 20)
                                        .overlay(
                                            Text(String(state.userName.prefix(1)).uppercased())
                                                .font(.system(size: 10, weight: .bold))
                                                .foregroundColor(.white)
                                        )
                                    Text(state.userName.isEmpty ? "Khách" : state.userName)
                                        .font(.system(size: 11, weight: .semibold))
                                        .lineLimit(1)
                                }
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(Color.secondary.opacity(0.14))
                                .cornerRadius(14)
                            }
                            .disabled(state.isRecording)
                        }
                    }

                    // Row 2: Modes + Layout + Font Stepper
                    HStack {
                        HStack(spacing: 2) {
                            ForEach([("two_way", "2 chiều"), ("one_way", "1 chiều"), ("scribe", "Note")], id: \.0) { mode, label in
                                let active = state.recordingMode == mode
                                Button(action: { helper.setMode(mode: mode) }) {
                                    Text(label)
                                        .font(.system(size: 11, weight: active ? .bold : .medium))
                                        .foregroundColor(active ? .primary : .secondary)
                                        .padding(.horizontal, 10)
                                        .padding(.vertical, 5)
                                        .background(active ? surface : Color.clear)
                                        .cornerRadius(12)
                                }
                                .disabled(state.isRecording)
                            }
                        }
                        .padding(2)
                        .background(Color.secondary.opacity(0.14))
                        .cornerRadius(14)

                        Spacer()

                        HStack(spacing: 6) {
                            HStack(spacing: 2) {
                                ForEach([("stacked", "rectangle.split.1x2"), ("split", "rectangle.split.2x1"), ("flipped", "arrow.triangle.2.circlepath")], id: \.0) { code, icon in
                                    let active = state.layoutMode == code
                                    Button(action: { helper.setLayoutMode(layout: code) }) {
                                        Image(systemName: icon)
                                            .font(.system(size: 12))
                                            .foregroundColor(active ? .blue : .secondary)
                                            .frame(width: 26, height: 26)
                                            .background(active ? surface : Color.clear)
                                            .cornerRadius(10)
                                    }
                                }
                            }
                            .padding(2)
                            .background(Color.secondary.opacity(0.14))
                            .cornerRadius(12)

                            HStack(spacing: 4) {
                                Button(action: { helper.stepFontSize(delta: -1) }) {
                                    Text("A−")
                                        .font(.system(size: 11, weight: .bold))
                                        .padding(.horizontal, 4)
                                }
                                Text("\(Int(18 * state.fontSize / 100))")
                                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                                    .foregroundColor(.secondary)
                                Button(action: { helper.stepFontSize(delta: 1) }) {
                                    Text("A+")
                                        .font(.system(size: 11, weight: .bold))
                                        .padding(.horizontal, 4)
                                }
                            }
                            .padding(.horizontal, 4)
                            .padding(.vertical, 4)
                            .background(Color.secondary.opacity(0.14))
                            .cornerRadius(12)
                        }
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(surface)

                if let err = state.error {
                    HStack {
                        Text(err)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.red)
                        Spacer()
                        Button("Đóng") {
                            helper.clearError()
                        }
                        .font(.system(size: 12, weight: .bold))
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(Color.red.opacity(0.14))
                }

                // DUAL TELEPROMPTER PANES
                GeometryReader { geo in
                    if state.layoutMode == "split" {
                        HStack(spacing: 1) {
                            IosTeleprompterPane(
                                isPartnerPane: true,
                                badge: selectedPartner.shortCode,
                                title: state.recordingMode == "scribe" ? "Bản ghi nguyên văn" : selectedPartner.name,
                                subtitle: state.partnerLang == "any" ? "Tự nhận diện" : "Màn hình đối tác",
                                messages: state.messages,
                                recordingMode: state.recordingMode,
                                partnerLang: state.partnerLang,
                                fontScale: fontScale,
                                isFlipped: false,
                                canChangeLang: !state.isRecording,
                                onOpenLang: { showLanguageSheet = true }
                            )
                            .frame(width: geo.size.width / 2)

                            IosTeleprompterPane(
                                isPartnerPane: false,
                                badge: state.recordingMode == "scribe" ? "AI" : "VI",
                                title: state.recordingMode == "scribe" ? "Meeting Note" : "Tiếng Việt",
                                subtitle: state.recordingMode == "scribe" ? "Ý chính & việc cần làm" : "Màn hình của bạn",
                                messages: state.messages,
                                recordingMode: state.recordingMode,
                                partnerLang: state.partnerLang,
                                fontScale: fontScale,
                                isFlipped: false,
                                canChangeLang: false,
                                onOpenLang: {}
                            )
                        }
                    } else {
                        VStack(spacing: 1) {
                            IosTeleprompterPane(
                                isPartnerPane: true,
                                badge: selectedPartner.shortCode,
                                title: state.recordingMode == "scribe" ? "Bản ghi nguyên văn" : selectedPartner.name,
                                subtitle: state.partnerLang == "any" ? "Tự nhận diện" : "Màn hình đối tác",
                                messages: state.messages,
                                recordingMode: state.recordingMode,
                                partnerLang: state.partnerLang,
                                fontScale: fontScale,
                                isFlipped: state.layoutMode == "flipped",
                                canChangeLang: !state.isRecording,
                                onOpenLang: { showLanguageSheet = true }
                            )
                            .frame(height: geo.size.height / 2)

                            IosTeleprompterPane(
                                isPartnerPane: false,
                                badge: state.recordingMode == "scribe" ? "AI" : "VI",
                                title: state.recordingMode == "scribe" ? "Meeting Note" : "Tiếng Việt",
                                subtitle: state.recordingMode == "scribe" ? "Ý chính & việc cần làm" : "Màn hình của bạn",
                                messages: state.messages,
                                recordingMode: state.recordingMode,
                                partnerLang: state.partnerLang,
                                fontScale: fontScale,
                                isFlipped: false,
                                canChangeLang: false,
                                onOpenLang: {}
                            )
                        }
                    }
                }

                // BOTTOM DOCK
                HStack {
                    HStack(spacing: 8) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(selectedPartner.shortCode)
                                .font(.system(size: 9, weight: .bold, design: .monospaced))
                                .foregroundColor(.blue)
                            Text("VI")
                                .font(.system(size: 9, weight: .bold, design: .monospaced))
                                .foregroundColor(.green)
                        }
                        Text(state.isConnecting ? "Đang kết nối..." : state.isRecording ? formatDurationSeconds(state.elapsedSeconds) : "Sẵn sàng")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(state.isRecording ? .red : .secondary)
                    }

                    Spacer()

                    Button(action: {
                        if state.isRecording {
                            helper.stop()
                        } else if state.sonioxApiKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                            showApiKeySheet = true
                        } else {
                            helper.start()
                        }
                    }) {
                        HStack(spacing: 6) {
                            Image(systemName: state.isRecording ? "stop.fill" : "mic.fill")
                                .font(.system(size: 13, weight: .bold))
                            Text(state.isRecording ? "Kết thúc" : "Bắt đầu phiên dịch")
                                .font(.system(size: 13, weight: .bold))
                        }
                        .foregroundColor(.white)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 11)
                        .background(state.isRecording ? Color.red : Color.blue)
                        .cornerRadius(24)
                    }

                    Spacer()

                    Button(action: { helper.toggleSyncScroll() }) {
                        Image(systemName: "link")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(state.syncScroll ? .blue : .secondary)
                            .frame(width: 34, height: 34)
                            .background(state.syncScroll ? Color.blue.opacity(0.15) : Color.secondary.opacity(0.14))
                            .cornerRadius(17)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(surface)
            }
        }
        .sheet(isPresented: $showLanguageSheet) {
            NavigationView {
                List(availableLanguages) { lang in
                    Button(action: {
                        helper.setPartnerLanguage(lang: lang.code)
                        showLanguageSheet = false
                    }) {
                        HStack {
                            Text(lang.shortCode)
                                .font(.system(size: 11, weight: .bold, design: .monospaced))
                                .foregroundColor(.blue)
                                .frame(width: 44, alignment: .leading)
                            Text(lang.name)
                                .font(.system(size: 14, weight: lang.code == state.partnerLang ? .bold : .regular))
                            Spacer()
                            if lang.code == state.partnerLang {
                                Image(systemName: "checkmark")
                                    .foregroundColor(.blue)
                            }
                        }
                    }
                }
                .navigationTitle("Ngôn ngữ đối tác")
                .navigationBarTitleDisplayMode(.inline)
            }
        }
        .sheet(isPresented: $showApiKeySheet) {
            IosApiKeySheetView(
                initialKey: state.sonioxApiKey,
                onSave: { newKey in
                    helper.updateApiKey(apiKey: newKey)
                    showApiKeySheet = false
                },
                onClose: { showApiKeySheet = false }
            )
        }
        .sheet(isPresented: $showProfileSheet) {
            IosProfileSheetView(
                initialName: state.userName,
                initialKey: state.sonioxApiKey,
                onSave: { newName, newKey in
                    helper.saveProfile(name: newName, apiKey: newKey)
                    showProfileSheet = false
                },
                onSignOut: {
                    showProfileSheet = false
                    helper.signOut()
                },
                onClose: { showProfileSheet = false }
            )
        }
    }
}

struct IosTeleprompterPane: View {
    let isPartnerPane: Bool
    let badge: String
    let title: String
    let subtitle: String
    let messages: [TranscriptMessage]
    let recordingMode: String
    let partnerLang: String
    let fontScale: CGFloat
    let isFlipped: Bool
    let canChangeLang: Bool
    let onOpenLang: () -> Void

    var body: some View {
        let roleColor: Color = isPartnerPane ? .blue : .green
        let isScribeNotes = recordingMode == "scribe" && !isPartnerPane

        VStack(spacing: 0) {
            // Pane Header
            HStack {
                if isPartnerPane && canChangeLang {
                    Button(action: onOpenLang) {
                        HStack(spacing: 6) {
                            Text(badge)
                                .font(.system(size: 10, weight: .bold, design: .monospaced))
                                .foregroundColor(roleColor)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(roleColor.opacity(0.15))
                                .cornerRadius(8)
                            Text(title)
                                .font(.system(size: 13, weight: .bold))
                                .foregroundColor(.primary)
                            Text("Đổi ngôn ngữ ▾")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundColor(.blue)
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.secondary.opacity(0.1))
                        .cornerRadius(14)
                    }
                } else {
                    HStack(spacing: 6) {
                        Text(badge)
                            .font(.system(size: 10, weight: .bold, design: .monospaced))
                            .foregroundColor(roleColor)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(roleColor.opacity(0.15))
                            .cornerRadius(8)
                        Text(title)
                            .font(.system(size: 13, weight: .bold))
                        Text(subtitle)
                            .font(.system(size: 11))
                            .foregroundColor(.secondary)
                    }
                }
                Spacer()
            }
            .padding(.horizontal, 12)
            .frame(height: 42)
            .overlay(Divider(), alignment: .bottom)

            if messages.isEmpty {
                VStack(spacing: 8) {
                    Spacer()
                    RoundedRectangle(cornerRadius: 12)
                        .fill(roleColor.opacity(0.14))
                        .frame(width: 40, height: 40)
                        .overlay(
                            Image(systemName: "mic.fill")
                                .foregroundColor(roleColor)
                        )
                    Text(isPartnerPane ? "Đặt màn hình hướng về phía người đối thoại." : "Kiểm tra chế độ và ngôn ngữ trước khi bật micro.")
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 24)
                    Spacer()
                }
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 10) {
                        ForEach(messages, id: \.id) { msg in
                            let displayText: String = {
                                if isScribeNotes {
                                    return "• \(msg.translation ?? msg.text)"
                                } else if recordingMode == "scribe" {
                                    return msg.text
                                } else if isPartnerPane {
                                    if partnerLang == "any" && msg.speaker == "host" {
                                        return msg.translation ?? msg.text
                                    }
                                    return msg.speaker == "partner" ? msg.text : (msg.translation ?? msg.text)
                                } else {
                                    return msg.speaker == "host" ? msg.text : (msg.translation ?? msg.text)
                                }
                            }()

                            if !displayText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                let isHost = msg.speaker == "host"
                                VStack(alignment: .leading, spacing: 4) {
                                    HStack(spacing: 6) {
                                        Circle()
                                            .fill(isHost ? Color.green : Color.blue)
                                            .frame(width: 6, height: 6)
                                        Text(isHost ? "Bạn" : title)
                                            .font(.system(size: 11, weight: .semibold))
                                            .foregroundColor(isHost ? .green : .blue)
                                        Text(formatDurationSeconds(Int32(msg.startMs / 1000)))
                                            .font(.system(size: 10, design: .monospaced))
                                            .foregroundColor(.secondary)
                                    }
                                    Text(displayText)
                                        .font(.system(size: 16 * fontScale, weight: msg.isFinal == 1 ? .medium : .regular))
                                        .foregroundColor(msg.isFinal == 1 ? .primary : .secondary)
                                }
                                .padding(.vertical, 4)
                            }
                        }
                    }
                    .padding(14)
                }
            }
        }
        .rotationEffect(.degrees(isFlipped ? 180 : 0))
    }
}

struct IosHistoryView: View {
    let helper: ViewModelHelper
    let state: SessionState
    let isDark: Bool

    @State private var showingDetail = false

    var filteredSessions: [Session] {
        let q = state.historySearchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if q.isEmpty { return state.historySessions }
        return state.historySessions.filter {
            $0.title.lowercased().contains(q) || $0.partnerLang.lowercased().contains(q)
        }
    }

    var selectedSession: Session? {
        state.historySessions.first(where: { $0.id == state.selectedHistorySessionId })
    }

    var body: some View {
        let bg = isDark ? Color(red: 11/255, green: 14/255, blue: 20/255) : Color(red: 244/255, green: 246/255, blue: 250/255)
        let surface = isDark ? Color(red: 19/255, green: 24/255, blue: 34/255) : Color.white

        ZStack {
            bg.ignoresSafeArea()

            VStack(spacing: 0) {
                HStack {
                    Button(action: {
                        if showingDetail {
                            showingDetail = false
                        } else {
                            helper.setScreen(screen: "session")
                        }
                    }) {
                        HStack(spacing: 4) {
                            Image(systemName: "chevron.left")
                            Text(showingDetail ? "Danh sách" : "Phiên dịch")
                        }
                        .font(.system(size: 14, weight: .semibold))
                    }

                    Spacer()

                    Text(showingDetail ? (selectedSession?.title ?? "Chi tiết") : "Lịch sử (\(state.historySessions.count))")
                        .font(.system(size: 15, weight: .bold))
                        .lineLimit(1)

                    Spacer()

                    Button("Phiên mới") {
                        helper.setScreen(screen: "session")
                    }
                    .font(.system(size: 13, weight: .bold))
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(surface)

                if !showingDetail {
                    VStack(spacing: 10) {
                        TextField(
                            "Tìm kiếm hội thoại...",
                            text: Binding(
                                get: { state.historySearchQuery },
                                set: { helper.setHistorySearchQuery(query: $0) }
                            )
                        )
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                        .padding(.horizontal, 14)
                        .padding(.top, 10)

                        if filteredSessions.isEmpty {
                            Spacer()
                            Text("Chưa có phiên dịch nào được lưu.")
                                .font(.system(size: 13))
                                .foregroundColor(.secondary)
                            Spacer()
                        } else {
                            List {
                                ForEach(filteredSessions, id: \.id) { sess in
                                    Button(action: {
                                        helper.selectHistorySession(sessionId: sess.id)
                                        showingDetail = true
                                    }) {
                                        HStack {
                                            VStack(alignment: .leading, spacing: 4) {
                                                Text(sess.title)
                                                    .font(.system(size: 14, weight: .bold))
                                                    .foregroundColor(.primary)
                                                HStack(spacing: 8) {
                                                    Text("\(sess.partnerLang.uppercased()) ⇄ VI")
                                                        .font(.system(size: 11, weight: .bold, design: .monospaced))
                                                        .foregroundColor(.blue)
                                                    Text(formatEpochMs(sess.createdAt))
                                                        .font(.system(size: 11))
                                                        .foregroundColor(.secondary)
                                                }
                                            }
                                            Spacer()
                                            Image(systemName: "chevron.right")
                                                .font(.system(size: 12))
                                                .foregroundColor(.secondary)
                                        }
                                    }
                                    .swipeActions {
                                        Button(role: .destructive) {
                                            helper.deleteHistorySession(sessionId: sess.id)
                                        } label: {
                                            Label("Xóa", systemImage: "trash")
                                        }
                                    }
                                }
                            }
                            .listStyle(.plain)
                        }
                    }
                } else {
                    if state.selectedHistoryMessages.isEmpty {
                        Spacer()
                        Text("Phiên hội thoại này chưa có câu thoại nào.")
                            .font(.system(size: 13))
                            .foregroundColor(.secondary)
                        Spacer()
                    } else {
                        ScrollView {
                            LazyVStack(alignment: .leading, spacing: 10) {
                                ForEach(state.selectedHistoryMessages, id: \.id) { entry in
                                    let isHost = entry.speaker == "host"
                                    VStack(alignment: .leading, spacing: 6) {
                                        HStack {
                                            Text(isHost ? "Bạn (VI)" : "Đối tác")
                                                .font(.system(size: 11, weight: .bold))
                                                .foregroundColor(isHost ? .green : .blue)
                                            Spacer()
                                            Text(formatDurationSeconds(Int32(entry.startMs / 1000)))
                                                .font(.system(size: 11, design: .monospaced))
                                                .foregroundColor(.secondary)
                                        }
                                        Text(entry.text)
                                            .font(.system(size: 14, weight: .semibold))
                                        if let trans = entry.translation, !trans.isEmpty {
                                            Text(trans)
                                                .font(.system(size: 13))
                                                .foregroundColor(.secondary)
                                        }
                                    }
                                    .padding(12)
                                    .background(surface)
                                    .cornerRadius(14)
                                }
                            }
                            .padding(14)
                        }
                    }
                }
            }
        }
    }
}

struct IosApiKeySheetView: View {
    let initialKey: String
    let onSave: (String) -> Void
    let onClose: () -> Void

    @State private var keyDraft: String = ""

    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("Soniox API Key"), footer: Text("Lấy API Key tại console.soniox.com để kết nối trực tiếp.")) {
                    SecureField("Dán Soniox API Key vào đây...", text: $keyDraft)
                }
            }
            .navigationTitle("Cấu hình API Key")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Đóng", action: onClose)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Lưu") {
                        onSave(keyDraft)
                    }
                    .disabled(keyDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .onAppear {
                keyDraft = initialKey
            }
        }
    }
}

struct IosProfileSheetView: View {
    let initialName: String
    let initialKey: String
    let onSave: (String, String) -> Void
    let onSignOut: () -> Void
    let onClose: () -> Void

    @State private var nameDraft: String = ""
    @State private var keyDraft: String = ""

    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("Thông tin hiển thị")) {
                    TextField("Tên hiển thị", text: $nameDraft)
                }
                Section(header: Text("Soniox API Key")) {
                    SecureField("Soniox API Key", text: $keyDraft)
                }
                Section {
                    Button(role: .destructive, action: onSignOut) {
                        Text("Đổi người dùng / Nhập lại từ đầu")
                    }
                }
            }
            .navigationTitle("Cài đặt")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Đóng", action: onClose)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Lưu") {
                        onSave(nameDraft, keyDraft)
                    }
                }
            }
            .onAppear {
                nameDraft = initialName
                keyDraft = initialKey
            }
        }
    }
}

struct UpdateOverlayView: View {
    let updateUrl: String

    var body: some View {
        ZStack {
            Color(red: 11/255, green: 14/255, blue: 20/255).ignoresSafeArea()
            VStack(spacing: 14) {
                Text("CẬP NHẬT ỨNG DỤNG")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundColor(.white)
                Text("Đã có bản cập nhật mới. Vui lòng nâng cấp để tiếp tục sử dụng.")
                    .font(.system(size: 13))
                    .foregroundColor(.gray)
                    .multilineTextAlignment(.center)
                Button(action: {
                    if let url = URL(string: updateUrl) {
                        UIApplication.shared.open(url)
                    }
                }) {
                    Text("Cập nhật ngay")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity, minHeight: 46)
                        .background(Color.blue)
                        .cornerRadius(23)
                }
            }
            .padding(24)
        }
    }
}

class ViewModelHelper: ObservableObject {
    private let viewModel: SessionViewModel
    @Published var state: SessionState

    init(viewModel: SessionViewModel) {
        self.viewModel = viewModel
        self.state = viewModel.state.value as! SessionState

        viewModel.watchState { [weak self] state in
            DispatchQueue.main.async {
                self?.state = state
            }
        }
    }

    func saveProfile(name: String, apiKey: String) {
        viewModel.saveProfile(name: name, sonioxKey: apiKey)
    }

    func updateApiKey(apiKey: String) {
        viewModel.updateApiKey(sonioxKey: apiKey)
    }

    func signOut() {
        viewModel.signOut()
    }

    func setScreen(screen: String) {
        viewModel.setScreen(screen: screen)
    }

    func setMode(mode: String) {
        viewModel.setMode(mode: mode)
    }

    func setPartnerLanguage(lang: String) {
        viewModel.setPartnerLanguage(lang: lang)
    }

    func setLayoutMode(layout: String) {
        viewModel.setLayoutMode(layout: layout)
    }

    func stepFontSize(delta: Int32) {
        viewModel.stepFontSize(delta: delta)
    }

    func toggleTheme() {
        viewModel.toggleTheme()
    }

    func toggleSyncScroll() {
        viewModel.toggleSyncScroll()
    }

    func clearError() {
        viewModel.clearError()
    }

    func selectHistorySession(sessionId: String?) {
        viewModel.selectHistorySession(sessionId: sessionId)
    }

    func setHistorySearchQuery(query: String) {
        viewModel.setHistorySearchQuery(query: query)
    }

    func deleteHistorySession(sessionId: String) {
        viewModel.deleteHistorySession(sessionId: sessionId)
    }

    func start() {
        viewModel.startSession()
    }

    func stop() {
        viewModel.stopSession()
    }
}
