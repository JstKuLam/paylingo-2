package com.paylingo.viewmodel

import com.paylingo.audio.AudioRecorder
import com.paylingo.db.SessionRepository
import com.paylingo.db.TranscriptMessage
import com.paylingo.network.SonioxInitialRequest
import com.paylingo.network.SonioxWebSocketClient
import com.paylingo.network.SonioxTranslationConfig
import com.paylingo.utils.currentTimeMillis
import com.paylingo.utils.UpdateManager
import com.paylingo.utils.UpdateCheckResult
import com.paylingo.utils.LocalNotificationManager
import com.paylingo.utils.AppLog
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import io.ktor.client.HttpClient
import io.ktor.client.request.post
import io.ktor.client.request.header
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
data class SonioxKeyResponse(
    val success: Boolean = false,
    val api_key: String? = null,
    val error: String? = null
)

@Serializable
data class SupabaseAuthResponse(
    val access_token: String? = null,
    val error: String? = null
)

data class AuthSession(
    val accessToken: String,
    val rawJson: String
)

object Base64Url {
    private const val BASE64URL_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

    fun encode(input: String): String {
        val bytes = input.encodeToByteArray()
        val result = StringBuilder()
        var i = 0
        while (i < bytes.size) {
            val b0 = bytes[i].toInt() and 0xFF
            val b1 = if (i + 1 < bytes.size) bytes[i + 1].toInt() and 0xFF else -1
            val b2 = if (i + 2 < bytes.size) bytes[i + 2].toInt() and 0xFF else -1

            val c0 = b0 shr 2
            val c1 = ((b0 and 0x03) shl 4) or (if (b1 != -1) b1 shr 4 else 0)
            val c2 = if (b1 != -1) ((b1 and 0x0F) shl 2) or (if (b2 != -1) b2 shr 6 else 0) else -1
            val c3 = if (b2 != -1) b2 and 0x3F else -1

            result.append(BASE64URL_CHARS[c0])
            result.append(BASE64URL_CHARS[c1])
            if (c2 != -1) result.append(BASE64URL_CHARS[c2])
            if (c3 != -1) result.append(BASE64URL_CHARS[c3])

            i += 3
        }
        return result.toString()
    }
}




data class SessionState(
    val isRecording: Boolean = false,
    val recordingMode: String = "one_way",
    val partnerLang: String = "en",
    val messages: List<TranscriptMessage> = emptyList(),
    val error: String? = null,
    val needsUpdate: Boolean = false,
    val updateUrl: String = ""
)

class SessionViewModel(
    private val audioRecorder: AudioRecorder,
    private val repository: SessionRepository,
    private val apiKey: String
) {
    private val scope = CoroutineScope(Dispatchers.Main)
    private val _state = MutableStateFlow(SessionState())
    val state: StateFlow<SessionState> = _state.asStateFlow()

    private val sonioxClient = SonioxWebSocketClient(apiKey)
    private val updateManager = UpdateManager()
    private val localNotificationManager = LocalNotificationManager()
    private var currentSessionId: String? = null

    init {
        scope.launch {
            checkForceUpdate()
        }
    }

    private suspend fun checkForceUpdate() {
        when (val result = updateManager.checkUpdate()) {
            is UpdateCheckResult.Success -> {
                if (result.needsUpdate) {
                    _state.update { it.copy(needsUpdate = true, updateUrl = result.updateUrl) }
                    localNotificationManager.showUpdateNotification(
                        title = "Bản cập nhật bắt buộc!",
                        message = "Đã có bản nâng cấp mới trên VPS. Vui lòng tải về phiên bản mới để tiếp tục dịch thuật."
                    )
                }
            }
            is UpdateCheckResult.Failure -> {
                // Fail-safe: do not block if network or VPS is down
            }
        }
    }

    fun setMode(mode: String) {
        if (_state.value.isRecording) return
        _state.update { it.copy(recordingMode = mode) }
    }

    fun setPartnerLanguage(lang: String) {
        if (_state.value.isRecording) return
        _state.update { it.copy(partnerLang = lang) }
    }

    private val SUPABASE_URL = "https://plokbhbcegrpxiczthvc.supabase.co"
    private val SUPABASE_ANON_KEY = "REDACTED_SUPABASE_LEGACY_PUBLISHABLE_ANON_KEY_"

    private suspend fun authenticateAnonymously(client: HttpClient): AuthSession {
        AppLog.d("SessionViewModel", "Authenticating anonymously with Supabase...")
        val response = client.post("$SUPABASE_URL/auth/v1/signup") {
            contentType(ContentType.Application.Json)
            header("apikey", SUPABASE_ANON_KEY)
            header("Authorization", "Bearer $SUPABASE_ANON_KEY")
            setBody("{\"data\":{\"username\":\"android_client\"}}")
        }
        val jsonText = response.bodyAsText()
        val result = Json { ignoreUnknownKeys = true }.decodeFromString<SupabaseAuthResponse>(jsonText)
        if (!result.access_token.isNullOrBlank()) {
            AppLog.d("SessionViewModel", "Successfully authenticated with Supabase anonymously.")
            return AuthSession(result.access_token, jsonText)
        } else {
            val err = result.error ?: "Auth token missing"
            AppLog.e("SessionViewModel", "Supabase anonymous auth failed: $err")
            throw Exception(err)
        }
    }

    private suspend fun fetchTemporarySonioxKey(): String {
        AppLog.d("SessionViewModel", "Initiating dynamic Soniox key generation...")
        val client = HttpClient()
        return try {
            // First authenticate with Supabase anonymously to get standard user JWT and raw JSON
            val authSession = try {
                authenticateAnonymously(client)
            } catch (authEx: Exception) {
                AppLog.e("SessionViewModel", "Supabase anonymous authentication failed. Cannot authorize with VPS backend.", authEx)
                throw authEx
            }

            // Encode the session into the exact cookie format used by @supabase/ssr
            val base64EncodedSession = Base64Url.encode(authSession.rawJson)
            val cookieValue = "base64-$base64EncodedSession"
            AppLog.d("SessionViewModel", "Generated Supabase SSR compatible session cookie.")

            // Request the temporary key from the VPS backend using BOTH the Authorization Bearer header AND the Cookie header
            AppLog.d("SessionViewModel", "Requesting Soniox key from VPS backend using session cookie and token...")
            val response = client.post("https://noidi.9phut.org/api/auth/soniox-key") {
                header("Authorization", "Bearer ${authSession.accessToken}")
                header("Cookie", "sb-aympjpedkyzzqoqsgkwl-auth-token=$cookieValue")
            }
            val jsonText = response.bodyAsText()
            val result = Json { ignoreUnknownKeys = true }.decodeFromString<SonioxKeyResponse>(jsonText)
            if (result.success && !result.api_key.isNullOrBlank()) {
                AppLog.d("SessionViewModel", "Successfully fetched temporary Soniox API key.")
                result.api_key
            } else {
                val err = result.error ?: "Unknown server error"
                AppLog.e("SessionViewModel", "Server failed to generate key: $err")
                throw Exception(err)
            }
        } catch (e: Exception) {
            AppLog.e("SessionViewModel", "Failed to fetch dynamic Soniox key from server!", e)
            throw e
        } finally {
            client.close()
        }
    }



    fun startSession() {
        if (_state.value.isRecording) return
        
        val sessionId = "session_${currentTimeMillis()}"
        currentSessionId = sessionId
        
        _state.update { it.copy(isRecording = true, messages = emptyList(), error = null) }
        AppLog.d("SessionViewModel", "=== START SESSION ===")
        AppLog.d("SessionViewModel", "Session ID: $sessionId")
        AppLog.d("SessionViewModel", "Mode: ${_state.value.recordingMode}, Language: ${_state.value.partnerLang}")

        scope.launch {
            try {
                // Fetch Soniox API Key dynamically before starting connection
                val activeApiKey = try {
                    fetchTemporarySonioxKey()
                } catch (e: Exception) {
                    AppLog.d("SessionViewModel", "Falling back to local apiKey constructor parameter...")
                    apiKey
                }

                AppLog.d("SessionViewModel", "Saving session to local SQLDelight SQLite DB...")
                repository.saveSession(
                    id = sessionId,
                    title = "Hội thoại ${currentTimeMillis()}",
                    mode = _state.value.recordingMode,
                    partnerLang = _state.value.partnerLang,
                    createdAt = currentTimeMillis()
                )
                AppLog.d("SessionViewModel", "Saved session to database successfully.")

                AppLog.d("SessionViewModel", "Accessing native hardware microphone via AudioRecorder...")
                val audioFlow = audioRecorder.startRecording()
                AppLog.d("SessionViewModel", "Microphone successfully active. Audio stream flow ready.")

                val translationConfig = when (_state.value.recordingMode) {
                    "one_way" -> SonioxTranslationConfig(
                        type = "one_way",
                        target_language = "vi"
                    )
                    "two_way" -> SonioxTranslationConfig(
                        type = "two_way",
                        language_a = "vi",
                        language_b = _state.value.partnerLang
                    )
                    else -> null
                }

                val sonioxConfig = SonioxInitialRequest(
                    api_key = activeApiKey,
                    language_hints = listOf("vi", _state.value.partnerLang),
                    language_hints_strict = _state.value.recordingMode == "two_way",
                    translation = translationConfig
                )

                AppLog.d("SessionViewModel", "Connecting to Soniox WebSocket endpoint api.soniox.com...")
                sonioxClient.startStreaming(sonioxConfig, audioFlow) { _ ->
                    scope.launch(Dispatchers.Default) {
                        val mockMsg = TranscriptMessage(
                            id = "msg_${currentTimeMillis()}",
                            sessionId = sessionId,
                            text = "Giọng nói nhận dạng...",
                            translation = "Translated text...",
                            speaker = "host",
                            startMs = 0L,
                            endMs = 1000L,
                            isFinal = 1L
                        )
                        repository.saveMessage(
                            id = mockMsg.id,
                            sessionId = mockMsg.sessionId,
                            text = mockMsg.text,
                            translation = mockMsg.translation,
                            speaker = mockMsg.speaker,
                            startMs = mockMsg.startMs,
                            endMs = mockMsg.endMs,
                            isFinal = true
                        )
                        val updatedList = _state.value.messages + mockMsg
                        _state.update { it.copy(messages = updatedList) }
                    }
                }
            } catch (e: Exception) {
                AppLog.e("SessionViewModel", "CRITICAL ERROR inside startSession!", e)
                val errMsg = e.message ?: e.toString()
                _state.update { it.copy(isRecording = false, error = errMsg) }
            }
        }
    }

    fun stopSession() {
        if (!_state.value.isRecording) return
        audioRecorder.stopRecording()
        _state.update { it.copy(isRecording = false) }
    }

    // Expose flow update observer helper for swift compatibility
    fun watchState(onUpdate: (SessionState) -> Unit) {
        scope.launch {
            state.collect { onUpdate(it) }
        }
    }
}
