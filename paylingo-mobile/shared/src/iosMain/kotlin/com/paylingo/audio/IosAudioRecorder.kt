@file:OptIn(kotlinx.cinterop.ExperimentalForeignApi::class)

package com.paylingo.audio

import kotlinx.cinterop.get
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import platform.AVFAudio.AVAudioEngine
import platform.AVFAudio.AVAudioPCMBuffer
import platform.AVFAudio.AVAudioSession
import platform.AVFAudio.AVAudioSessionCategoryOptionAllowBluetooth
import platform.AVFAudio.AVAudioSessionCategoryOptionDefaultToSpeaker
import platform.AVFAudio.AVAudioSessionCategoryPlayAndRecord
import kotlin.math.roundToInt

class IosAudioRecorder : AudioRecorder {
    private val audioEngine = AVAudioEngine()
    // Replay up to 256 PCM chunks (~8s of initial speech) while the WebSocket handshake completes
    private val _audioFlow = MutableSharedFlow<ByteArray>(replay = 256, extraBufferCapacity = 256)
    private var isRecording = false

    override fun startRecording(): Flow<ByteArray> {
        if (isRecording) return _audioFlow.asSharedFlow()
        @OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
        _audioFlow.resetReplayCache()

        try {
            val audioSession = AVAudioSession.sharedInstance()
            audioSession.setCategory(
                category = AVAudioSessionCategoryPlayAndRecord,
                withOptions = AVAudioSessionCategoryOptionDefaultToSpeaker or AVAudioSessionCategoryOptionAllowBluetooth,
                error = null
            )
            audioSession.setActive(true, error = null)
        } catch (_: Throwable) {}

        val inputNode = audioEngine.inputNode
        runCatching { inputNode.removeTapOnBus(0uL) }
        val inputFormat = inputNode.inputFormatForBus(0uL)
        val inputSampleRate = if (inputFormat.sampleRate > 0.0) inputFormat.sampleRate else 16000.0

        inputNode.installTapOnBus(
            bus = 0uL,
            bufferSize = 4096u,
            format = inputFormat
        ) { buffer, _ ->
            if (buffer != null) {
                val pcmData = convertFloatBufferToPcm16At16kHz(buffer, inputSampleRate)
                if (pcmData.isNotEmpty()) {
                    _audioFlow.tryEmit(pcmData)
                }
            }
        }

        audioEngine.prepare()
        val started = audioEngine.startAndReturnError(null)
        if (!started) {
            runCatching { inputNode.removeTapOnBus(0uL) }
            isRecording = false
            throw IllegalStateException("Failed to start AVAudioEngine on iOS.")
        }
        isRecording = true

        return _audioFlow.asSharedFlow()
    }

    override fun stopRecording() {
        if (!isRecording) return
        isRecording = false
        runCatching { audioEngine.inputNode.removeTapOnBus(0uL) }
        runCatching { audioEngine.stop() }
        runCatching { AVAudioSession.sharedInstance().setActive(false, error = null) }
    }

    private fun convertFloatBufferToPcm16At16kHz(
        buffer: AVAudioPCMBuffer,
        inputSampleRate: Double
    ): ByteArray {
        val inFrames = buffer.frameLength.toInt()
        if (inFrames <= 0) return ByteArray(0)
        val channelPtr = buffer.floatChannelData ?: return ByteArray(0)
        val floatData = channelPtr[0] ?: return ByteArray(0)

        val targetRate = 16000.0
        val ratio = if (inputSampleRate > 0.0) inputSampleRate / targetRate else 1.0
        val outFrames = if (ratio == 1.0) inFrames else (inFrames / ratio).roundToInt().coerceAtLeast(1)
        val pcm = ByteArray(outFrames * 2)

        for (i in 0 until outFrames) {
            val sample: Float = if (ratio > 1.05) {
                // Box-average anti-aliasing filter over the decimation window (e.g. 48kHz -> 16kHz averages 3 samples)
                val startIdx = (i * ratio).toInt().coerceIn(0, inFrames - 1)
                val endIdx = (((i + 1) * ratio).toInt() - 1).coerceIn(startIdx, inFrames - 1)
                var sum = 0.0f
                var count = 0
                for (k in startIdx..endIdx) {
                    sum += floatData[k]
                    count++
                }
                if (count > 0) sum / count else floatData[startIdx]
            } else {
                val srcPos = i * ratio
                val srcIdx = srcPos.toInt().coerceIn(0, inFrames - 1)
                val nextIdx = (srcIdx + 1).coerceIn(0, inFrames - 1)
                val frac = (srcPos - srcIdx).toFloat()
                floatData[srcIdx] * (1.0f - frac) + floatData[nextIdx] * frac
            }
            val shortVal = (sample * 32767.0f).coerceIn(-32768.0f, 32767.0f).toInt()
            pcm[i * 2] = (shortVal and 0xFF).toByte()
            pcm[i * 2 + 1] = ((shortVal shr 8) and 0xFF).toByte()
        }
        return pcm
    }
}
