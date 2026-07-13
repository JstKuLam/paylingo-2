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
    private val client = HttpClient {
        install(WebSockets)
    }

    suspend fun startStreaming(
        initialRequest: SonioxInitialRequest,
        pcmAudioFlow: Flow<ByteArray>,
        onTranscriptReceived: (String) -> Unit
    ) {
        
        val jsonSerializer = Json { encodeDefaults = true }
        val initialRequestJson = jsonSerializer.encodeToString(initialRequest)
        AppLog.d("SonioxWebSocketClient", "Setup payload: $initialRequestJson")

        try {
            AppLog.d("SonioxWebSocketClient", "Opening WebSocket connection: wss://stt-rt.soniox.com/transcribe-websocket")
            val session = client.webSocketSession("wss://stt-rt.soniox.com/transcribe-websocket")
            AppLog.d("SonioxWebSocketClient", "WebSocket session established! Sending setup frame...")
            
            // Send initial setup frame
            session.send(Frame.Text(initialRequestJson))
            AppLog.d("SonioxWebSocketClient", "Setup frame sent successfully. Activating PCM streaming...")

            var chunkCount = 0
            var totalBytes = 0

            // Concurrently stream binary PCM audio chunks
            val audioJob = session.launch {
                try {
                    pcmAudioFlow.collect { chunk ->
                        chunkCount++
                        totalBytes += chunk.size
                        if (chunkCount % 20 == 1) { // Log every 20th chunk to prevent console flood
                            AppLog.d("SonioxWebSocketClient", "Streaming chunk #$chunkCount (${chunk.size} bytes). Total: $totalBytes bytes")
                        }
                        session.send(Frame.Binary(true, chunk))
                    }
                } catch (e: Exception) {
                    AppLog.e("SonioxWebSocketClient", "Error inside PCM streaming coroutine!", e)
                    throw e
                }
            }

            AppLog.d("SonioxWebSocketClient", "Audio streaming flow connected. Listening for incoming text frames...")

            // Receive real-time STT transcripts
            for (frame in session.incoming) {
                if (frame is Frame.Text) {
                    val rawText = frame.readText()
                    AppLog.d("SonioxWebSocketClient", "Raw transcript frame: $rawText")
                    onTranscriptReceived(rawText)
                }
            }
            AppLog.d("SonioxWebSocketClient", "WebSocket session ended naturally by server.")
            audioJob.cancel()
            session.close()
        } catch (e: Exception) {
            AppLog.e("SonioxWebSocketClient", "WebSocket connection failed or crashed!", e)
            throw e
        }
    }
}
