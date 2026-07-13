import SwiftUI
import shared

struct UpdateOverlayView: View {
    let updateUrl: String

    var body: some View {
        ZStack {
            Color(red: 9/255, green: 9/255, blue: 11/255)
                .ignoresSafeArea()

            VStack(spacing: 16) {
                Spacer()

                VStack(spacing: 12) {
                    Text("CẬP NHẬT BẮT BUỘC")
                        .font(.system(size: 16, weight: .black))
                        .foregroundColor(.red)

                    Text("Đã có bản cập nhật mới trên TestFlight. Vui lòng nâng cấp ứng dụng để tiếp tục sử dụng dịch vụ.")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(.gray)
                        .multilineTextAlignment(.center)
                        .lineSpacing(4)
                        .padding(.horizontal)

                    Spacer()
                        .frame(height: 12)

                    Button(action: {
                        if let url = URL(string: updateUrl) {
                            UIApplication.shared.open(url)
                        }
                    }) {
                        Text("CẬP NHẬT QUA TESTFLIGHT")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity, height: 48)
                            .background(Color.blue)
                            .cornerRadius(24)
                    }
                }
                .padding(24)
                .background(Color(red: 24/255, green: 24/255, blue: 27/255))
                .cornerRadius(24)
                .padding(24)

                Spacer()
            }
        }
    }
}

struct ContentView: View {
    @ObservedObject var viewModelHelper: ViewModelHelper

    init() {
        let driverFactory = DatabaseDriverFactory()
        let repository = SessionRepository(databaseDriverFactory: driverFactory)
        let audioRecorder = IosAudioRecorder()
        let viewModel = SessionViewModel(
            audioRecorder: audioRecorder,
            repository: repository,
            apiKey: "MOCK_SONIOX_KEY"
        )
        self.viewModelHelper = ViewModelHelper(viewModel: viewModel)
    }

    var body: some View {
        Group {
            if viewModelHelper.state.needsUpdate {
                UpdateOverlayView(updateUrl: viewModelHelper.state.updateUrl)
            } else {
                ZStack {
                    Color(red: 9/255, green: 9/255, blue: 11/255)
                        .ignoresSafeArea()

            VStack(spacing: 16) {
                // Header
                Text("PAY LINGO")
                    .font(.system(size: 20, weight: .black, design: .default))
                    .foregroundColor(.white)
                    .padding(.top, 8)

                // Segmented Modes Capsule
                HStack(spacing: 0) {
                    ForEach(["one_way", "two_way", "scribe"], id: \.self) { mode in
                        Button(action: {
                            viewModelHelper.setMode(mode: mode)
                        }) {
                            Text(mode == "one_way" ? "One Way" : mode == "two_way" ? "Two Way" : "Scribe")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundColor(viewModelHelper.state.recordingMode == mode ? .white : .gray)
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                                .background(viewModelHelper.state.recordingMode == mode ? Color.blue : Color.clear)
                                .cornerRadius(20)
                        }
                    }
                }
                .frame(height: 38)
                .padding(2)
                .background(Color.white.opacity(0.08))
                .cornerRadius(22)

                // Translation Display Grid
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        if viewModelHelper.state.messages.isEmpty {
                            Text("Chạm vào nút ghi âm để bắt đầu dịch...")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(.gray)
                                .frame(maxWidth: .infinity, minHeight: 250, alignment: .center)
                        } else {
                            ForEach(viewModelHelper.state.messages, id: \.id) { msg in
                                VStack(alignment: msg.speaker == "host" ? .trailing : .leading, spacing: 4) {
                                    Text(msg.speaker == "host" ? "BẠN" : "ĐỐI TÁC")
                                        .font(.system(size: 9, weight: .black))
                                        .foregroundColor(msg.speaker == "host" ? .blue : .green)
                                    
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(msg.text)
                                            .font(.system(size: 14, weight: .medium))
                                            .foregroundColor(.white)
                                        if let translation = msg.translation {
                                            Text(translation)
                                                .font(.system(size: 12))
                                                .foregroundColor(.gray)
                                        }
                                    }
                                    .padding(12)
                                    .background(msg.speaker == "host" ? Color(red: 30/255, green: 41/255, blue: 59/255) : Color(red: 6/255, green: 95/255, blue: 70/255))
                                    .cornerRadius(16)
                                }
                                .frame(maxWidth: .infinity, alignment: msg.speaker == "host" ? .trailing : .leading)
                            }
                        }
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding()
                .background(Color.white.opacity(0.03))
                .cornerRadius(24)

                // Recording Action Button Footer
                Button(action: {
                    if viewModelHelper.state.isRecording {
                        viewModelHelper.stop()
                    } else {
                        viewModelHelper.start()
                    }
                }) {
                    Text(viewModelHelper.state.isRecording ? "DỪNG GHI ÂM" : "BẮT ĐẦU DỊCH THUẬT")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity, height: 48)
                        .background(viewModelHelper.state.isRecording ? Color.red : Color.blue)
                        .cornerRadius(24)
                }
            }
            .padding()
            }
        }
    }
}

class ViewModelHelper: ObservableObject {
    private let viewModel: SessionViewModel
    @Published var state: SessionState

    init(viewModel: SessionViewModel) {
        self.viewModel = viewModel
        self.state = viewModel.state.value

        // Subscribe to State Flow using watchState helper
        viewModel.watchState { [weak self] state in
            DispatchQueue.main.async {
                self?.state = state
            }
        }
    }

    func setMode(mode: String) {
        viewModel.setMode(mode: mode)
    }

    func start() {
        viewModel.startSession()
    }

    func stop() {
        viewModel.stopSession()
    }
}
