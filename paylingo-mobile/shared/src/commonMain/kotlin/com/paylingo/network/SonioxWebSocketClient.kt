package com.paylingo.network

import com.paylingo.utils.AppLog
import io.ktor.client.HttpClient
import io.ktor.client.plugins.websocket.WebSockets
import io.ktor.client.plugins.websocket.webSocketSession
import io.ktor.websocket.Frame
import io.ktor.websocket.readText
import io.ktor.websocket.close
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.encodeToString

class SonioxWebSocketClient(private val apiKey: String) {
    companion object {
        private val sharedClient by lazy {
            HttpClient {
                install(WebSockets)
            }
        }
    }

    suspend fun startStreaming(
        initialRequest: SonioxInitialRequest,
        pcmAudioFlow: Flow<ByteArray>,
        onConnected: () -> Unit = {},
        onTranscriptReceived: suspend (String) -> Unit
    ) {
        val jsonSerializer = Json { encodeDefaults = true }
        val initialRequestJson = jsonSerializer.encodeToString(initialRequest)

        var session: io.ktor.client.plugins.websocket.DefaultClientWebSocketSession? = null
        var audioJob: kotlinx.coroutines.Job? = null
        try {
            AppLog.d("SonioxWebSocketClient", "Opening WebSocket connection: wss://stt-rt.soniox.com/transcribe-websocket")
            val activeSession = sharedClient.webSocketSession("wss://stt-rt.soniox.com/transcribe-websocket")
            session = activeSession
            AppLog.d("SonioxWebSocketClient", "WebSocket session established! Sending setup frame...")

            // Send initial setup frame
            activeSession.send(Frame.Text(initialRequestJson))
            AppLog.d("SonioxWebSocketClient", "Setup frame sent successfully. Activating PCM streaming...")
            onConnected()

            var chunkCount = 0
            var totalBytes = 0

            // Concurrently stream binary PCM audio chunks
            audioJob = activeSession.launch {
                try {
                    pcmAudioFlow.collect { chunk ->
                        chunkCount++
                        totalBytes += chunk.size
                        if (chunkCount % 20 == 1) {
                            AppLog.d("SonioxWebSocketClient", "Streaming chunk #$chunkCount (${chunk.size} bytes). Total: $totalBytes bytes")
                        }
                        activeSession.send(Frame.Binary(true, chunk))
                    }
                } catch (e: kotlinx.coroutines.CancellationException) {
                    throw e
                } catch (e: Exception) {
                    AppLog.e("SonioxWebSocketClient", "Error inside PCM streaming coroutine!", e)
                    throw e
                }
            }

            AppLog.d("SonioxWebSocketClient", "Audio streaming flow connected. Listening for incoming text frames...")

            // Receive real-time STT transcripts sequentially
            for (frame in activeSession.incoming) {
                if (frame is Frame.Text) {
                    val rawText = frame.readText()
                    onTranscriptReceived(rawText)
                }
            }
            AppLog.d("SonioxWebSocketClient", "WebSocket session ended naturally by server.")
        } catch (e: kotlinx.coroutines.CancellationException) {
            AppLog.d("SonioxWebSocketClient", "WebSocket streaming cancelled by user.")
            throw e
        } catch (e: Exception) {
            AppLog.e("SonioxWebSocketClient", "WebSocket connection failed or crashed!", e)
            throw e
        } finally {
            audioJob?.cancel()
            runCatching { session?.send(Frame.Text("")) }
            runCatching { session?.close() }
        }
    }
}
