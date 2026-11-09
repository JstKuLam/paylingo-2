package com.paylingo.viewmodel

import com.paylingo.audio.AudioRecorder
import com.paylingo.db.Session
import com.paylingo.db.SessionRepository
import com.paylingo.db.TranscriptMessage
import com.paylingo.network.SonioxInitialRequest
import com.paylingo.network.SonioxParser
import com.paylingo.network.SonioxTranslationConfig
import com.paylingo.network.SonioxWebSocketClient
import com.paylingo.utils.AppLog
import com.paylingo.utils.LocalNotificationManager
import com.paylingo.utils.UpdateCheckResult
import com.paylingo.utils.UpdateManager
import com.paylingo.utils.UserPreferences
import com.paylingo.utils.currentTimeMillis
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

data class SessionState(
    val userName: String = "",
    val sonioxApiKey: String = "",
    val isOnboarded: Boolean = false,
    val activeScreen: String = "session", // "session" | "history"
    val isRecording: Boolean = false,
    val isConnecting: Boolean = false,
    val recordingMode: String = "two_way", // "two_way" | "one_way" | "scribe"
    val partnerLang: String = "en",
    val layoutMode: String = "stacked", // "stacked" | "split" | "flipped"
    val fontSize: Int = 100, // 75 | 100 | 120 | 150
    val themeMode: String = "dark", // "dark" | "light"
    val syncScroll: Boolean = true,
    val elapsedSeconds: Int = 0,
    val messages: List<TranscriptMessage> = emptyList(),
    val historySessions: List<Session> = emptyList(),
    val selectedHistorySessionId: String? = null,
    val selectedHistoryMessages: List<TranscriptMessage> = emptyList(),
    val historySearchQuery: String = "",
    val error: String? = null,
    val needsUpdate: Boolean = false,
    val updateUrl: String = ""
)

class SessionViewModel(
    private val audioRecorder: AudioRecorder,
    private val repository: SessionRepository,
    private val apiKey: String = ""
) {
    private val scope = CoroutineScope(Dispatchers.Main)
    private val _state = MutableStateFlow(SessionState())
    val state: StateFlow<SessionState> = _state.asStateFlow()

    private val updateManager = UpdateManager()
    private val localNotificationManager = LocalNotificationManager()
    private var currentSessionId: String? = null
    private var streamingJob: Job? = null
    private var timerJob: Job? = null

    companion object {
        private val FONT_STEPS = listOf(75, 100, 120, 150)
        private val AUTO_HINT_LANGUAGES = listOf("vi", "en", "zh", "ja", "ko", "es", "ru", "de", "th")
    }

    init {
        val storedName = UserPreferences.getUserName()
        val storedKey = UserPreferences.getSonioxApiKey().ifEmpty {
            if (apiKey.isNotBlank() && apiKey != "MOCK_SONIOX_KEY") apiKey else ""
        }
        val storedLayout = UserPreferences.getLayoutMode()
        val storedFont = UserPreferences.getFontSize()
        val storedTheme = UserPreferences.getThemeMode()

        _state.update {
            it.copy(
                userName = storedName,
                sonioxApiKey = storedKey,
                isOnboarded = storedName.isNotBlank(),
                layoutMode = storedLayout,
                fontSize = storedFont,
                themeMode = storedTheme
            )
        }

        scope.launch {
            refreshHistory()
            checkForceUpdate()
        }
    }

    private suspend fun checkForceUpdate() {
        when (val result = updateManager.checkUpdate()) {
            is UpdateCheckResult.Success -> {
                if (result.needsUpdate) {
                    _state.update { it.copy(needsUpdate = true, updateUrl = result.updateUrl) }
                    localNotificationManager.showUpdateNotification(
                        title = "Bản cập nhật mới",
                        message = "Đã có phiên bản PayLingo mới. Vui lòng cập nhật để tiếp tục sử dụng."
                    )
                }
            }
            is UpdateCheckResult.Failure -> {
                // Fail-safe: do not block if offline
            }
        }
    }

    fun saveProfile(name: String, sonioxKey: String) {
        val cleanName = name.trim().take(80)
        val cleanKey = sonioxKey.trim().take(256)
        if (cleanName.isNotEmpty()) {
            UserPreferences.setUserName(cleanName)
        }
        UserPreferences.setSonioxApiKey(cleanKey)
        _state.update {
            it.copy(
                userName = if (cleanName.isNotEmpty()) cleanName else it.userName,
                sonioxApiKey = cleanKey,
                isOnboarded = cleanName.isNotEmpty() || it.userName.isNotEmpty(),
                error = null
            )
        }
    }

    fun updateApiKey(sonioxKey: String) {
        val cleanKey = sonioxKey.trim().take(256)
        UserPreferences.setSonioxApiKey(cleanKey)
        _state.update { it.copy(sonioxApiKey = cleanKey, error = null) }
    }

    fun signOut() {
        if (_state.value.isRecording || _state.value.isConnecting) {
            stopSession()
        }
        UserPreferences.setUserName("")
        UserPreferences.setSonioxApiKey("")
        _state.update {
            it.copy(
                userName = "",
                sonioxApiKey = "",
                isOnboarded = false,
                activeScreen = "session",
                error = null
            )
        }
    }

    fun setScreen(screen: String) {
        if (_state.value.isRecording && screen != "session") return
        _state.update { it.copy(activeScreen = screen, error = null) }
        if (screen == "history") {
            scope.launch { refreshHistory() }
        }
    }

    fun setMode(mode: String) {
        if (_state.value.isRecording || _state.value.isConnecting) return
        val nextLang = when {
            mode == "one_way" -> "any"
            mode == "two_way" && _state.value.partnerLang == "any" -> "en"
            else -> _state.value.partnerLang
        }
        _state.update { it.copy(recordingMode = mode, partnerLang = nextLang) }
    }

    fun setPartnerLanguage(lang: String) {
        if (_state.value.isRecording || _state.value.isConnecting) return
        _state.update { it.copy(partnerLang = lang) }
    }

    fun setLayoutMode(layout: String) {
        UserPreferences.setLayoutMode(layout)
        _state.update { it.copy(layoutMode = layout) }
    }

    fun stepFontSize(delta: Int) {
        val currentIdx = FONT_STEPS.indexOf(_state.value.fontSize).let { if (it < 0) 1 else it }
        val nextIdx = (currentIdx + delta).coerceIn(0, FONT_STEPS.lastIndex)
        val nextSize = FONT_STEPS[nextIdx]
        UserPreferences.setFontSize(nextSize)
        _state.update { it.copy(fontSize = nextSize) }
    }

    fun toggleTheme() {
        val next = if (_state.value.themeMode == "dark") "light" else "dark"
        UserPreferences.setThemeMode(next)
        _state.update { it.copy(themeMode = next) }
    }

    fun toggleSyncScroll() {
        _state.update { it.copy(syncScroll = !it.syncScroll) }
    }

    fun clearError() {
        _state.update { it.copy(error = null) }
    }

    suspend fun refreshHistory() {
        val all = try {
            repository.getAllSessions()
        } catch (_: Exception) {
            emptyList()
        }
        val currentSelectedId = _state.value.selectedHistorySessionId
        val nextSelectedId = if (currentSelectedId != null && all.any { it.id == currentSelectedId }) {
            currentSelectedId
        } else {
            all.firstOrNull()?.id
        }
        val selectedMessages = if (nextSelectedId != null) {
            try {
                repository.getMessagesForSession(nextSelectedId)
            } catch (_: Exception) {
                emptyList()
            }
        } else {
            emptyList()
        }
        _state.update {
            it.copy(
                historySessions = all,
                selectedHistorySessionId = nextSelectedId,
                selectedHistoryMessages = selectedMessages
            )
        }
    }

    fun selectHistorySession(sessionId: String?) {
        _state.update { it.copy(selectedHistorySessionId = sessionId) }
        if (sessionId != null) {
            scope.launch {
                val msgs = try {
                    repository.getMessagesForSession(sessionId)
                } catch (_: Exception) {
                    emptyList()
                }
                _state.update { it.copy(selectedHistoryMessages = msgs) }
            }
        } else {
            _state.update { it.copy(selectedHistoryMessages = emptyList()) }
        }
    }

    fun setHistorySearchQuery(query: String) {
        _state.update { it.copy(historySearchQuery = query) }
    }

    fun renameHistorySession(sessionId: String, newTitle: String) {
        val clean = newTitle.trim().take(120)
        if (clean.isEmpty()) return
        scope.launch {
            try {
                repository.renameSession(sessionId, clean)
                refreshHistory()
            } catch (_: Exception) {}
        }
    }

    fun deleteHistorySession(sessionId: String) {
        scope.launch {
            try {
                repository.deleteSession(sessionId)
                refreshHistory()
            } catch (_: Exception) {}
        }
    }

    fun startSession() {
        if (_state.value.isRecording || _state.value.isConnecting) return

        val activeApiKey = _state.value.sonioxApiKey.trim()
        if (activeApiKey.isEmpty()) {
            _state.update {
                it.copy(error = "Vui lòng nhập Soniox API Key trước khi bắt đầu phiên dịch.")
            }
            return
        }

        val now = currentTimeMillis()
        val sessionId = "session_$now"
        currentSessionId = sessionId
        val parser = SonioxParser(sessionId)

        _state.update {
            it.copy(
                isConnecting = true,
                isRecording = true,
                elapsedSeconds = 0,
                messages = emptyList(),
                error = null
            )
        }

        timerJob?.cancel()
        timerJob = scope.launch {
            while (isActive && _state.value.isRecording) {
                delay(1000L)
                if (_state.value.isRecording) {
                    _state.update { s -> s.copy(elapsedSeconds = s.elapsedSeconds + 1) }
                }
            }
        }

        val prevStreamingJob = streamingJob
        streamingJob = scope.launch {
            prevStreamingJob?.cancel()
            prevStreamingJob?.join()
            val savedFinalSignatures = mutableMapOf<String, String>()
            try {
                val modeLabel = when (_state.value.recordingMode) {
                    "one_way" -> "Dịch 1 chiều"
                    "scribe" -> "Meeting Note"
                    else -> "Dịch 2 chiều"
                }
                repository.saveSession(
                    id = sessionId,
                    title = "$modeLabel • ${_state.value.partnerLang.uppercase()}",
                    mode = _state.value.recordingMode,
                    partnerLang = _state.value.partnerLang,
                    createdAt = now
                )

                val audioFlow = audioRecorder.startRecording()

                val mode = _state.value.recordingMode
                val partner = _state.value.partnerLang
                val isAuto = mode == "one_way" || partner == "any"

                val translationConfig = when (mode) {
                    "scribe" -> null
                    "one_way" -> SonioxTranslationConfig(
                        type = "one_way",
                        target_language = "vi"
                    )
                    else -> if (partner == "any") {
                        SonioxTranslationConfig(
                            type = "one_way",
                            target_language = "vi"
                        )
                    } else {
                        SonioxTranslationConfig(
                            type = "two_way",
                            language_a = "vi",
                            language_b = partner
                        )
                    }
                }

                val sonioxConfig = SonioxInitialRequest(
                    api_key = activeApiKey,
                    language_hints = if (isAuto) AUTO_HINT_LANGUAGES else listOf("vi", partner),
                    language_hints_strict = !isAuto && mode == "two_way",
                    translation = translationConfig
                )

                val sonioxClient = SonioxWebSocketClient(activeApiKey)
                sonioxClient.startStreaming(
                    initialRequest = sonioxConfig,
                    pcmAudioFlow = audioFlow,
                    onConnected = {
                        _state.update { it.copy(isConnecting = false) }
                    }
                ) { rawFrame ->
                    // Process sequentially in the WebSocket receive coroutine so SonioxParser
                    // never experiences concurrent mutation races on finalTokens/partialTokens.
                    val parsedMessages = kotlinx.coroutines.withContext(Dispatchers.Default) {
                        parser.processFrame(rawFrame)
                    }
                    _state.update { it.copy(messages = parsedMessages) }

                    val dirtyFinals = parsedMessages.filter { msg ->
                        if (msg.isFinal != 1L) false
                        else {
                            val sig = "${msg.text}\u0000${msg.translation ?: ""}"
                            if (savedFinalSignatures[msg.id] != sig) {
                                savedFinalSignatures[msg.id] = sig
                                true
                            } else {
                                false
                            }
                        }
                    }
                    if (dirtyFinals.isNotEmpty()) {
                        repository.saveMessagesBatch(dirtyFinals)
                    }
                }
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                AppLog.e("SessionViewModel", "Error in startSession", e)
                val errMsg = e.message ?: "Không thể khởi tạo phiên dịch. Kiểm tra lại Soniox API Key hoặc quyền Micro."
                _state.update { it.copy(isRecording = false, isConnecting = false, error = errMsg) }
            } finally {
                // Flush any remaining in-flight messages on exit/stop so the last utterance is not lost
                val remaining = _state.value.messages.map { it.copy(isFinal = 1L) }
                if (remaining.isNotEmpty()) {
                    kotlinx.coroutines.withContext(kotlinx.coroutines.NonCancellable) {
                        runCatching { repository.saveMessagesBatch(remaining) }
                    }
                }
                if (currentSessionId == sessionId) {
                    audioRecorder.stopRecording()
                    timerJob?.cancel()
                    _state.update { it.copy(isRecording = false, isConnecting = false) }
                }
                kotlinx.coroutines.withContext(kotlinx.coroutines.NonCancellable) {
                    runCatching { refreshHistory() }
                }
            }
        }
    }

    fun stopSession() {
        if (!_state.value.isRecording && !_state.value.isConnecting) return
        val remaining = _state.value.messages.map { it.copy(isFinal = 1L) }
        timerJob?.cancel()
        streamingJob?.cancel()
        audioRecorder.stopRecording()
        _state.update { it.copy(isRecording = false, isConnecting = false) }
        scope.launch {
            if (remaining.isNotEmpty()) {
                runCatching { repository.saveMessagesBatch(remaining) }
            }
            refreshHistory()
        }
    }

    fun watchState(onUpdate: (SessionState) -> Unit) {
        scope.launch {
            state.collect { onUpdate(it) }
        }
    }
}
