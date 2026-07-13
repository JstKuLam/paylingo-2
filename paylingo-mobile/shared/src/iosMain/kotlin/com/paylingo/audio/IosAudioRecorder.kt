package com.paylingo.audio

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import platform.AVFAudio.AVAudioEngine
import platform.AVFAudio.AVAudioFormat
import platform.AVFAudio.AVAudioPCMBuffer
import platform.AVFAudio.AVAudioPCMFormatFloat32

class IosAudioRecorder : AudioRecorder {
    private val audioEngine = AVAudioEngine()
    private val _audioFlow = MutableSharedFlow<ByteArray>(extraBufferCapacity = 64)
    private var isRecording = false

    override fun startRecording(): Flow<ByteArray> {
        if (isRecording) return _audioFlow.asSharedFlow()
        isRecording = true

        val inputNode = audioEngine.inputNode
        val inputFormat = inputNode.inputFormatForBus(0L)
        
        val targetFormat = AVAudioFormat(
            commonFormat = AVAudioPCMFormatFloat32,
            sampleRate = 16000.0,
            channels = 1L,
            interleaved = false
        )

        inputNode.installTapOnBus(
            bus = 0L,
            bufferSize = 1024U,
            format = inputFormat
        ) { buffer, _ ->
            if (buffer != null) {
                val pcmData = convertFloatBufferToPcm16(buffer)
                _audioFlow.tryEmit(pcmData)
            }
        }

        audioEngine.prepare()
        audioEngine.startAndReturnError(null)

        return _audioFlow.asSharedFlow()
    }

    override fun stopRecording() {
        if (!isRecording) return
        isRecording = false
        audioEngine.inputNode.removeTapOnBus(0L)
        audioEngine.stop()
    }

    private fun convertFloatBufferToPcm16(buffer: AVAudioPCMBuffer): ByteArray {
        val frameLength = buffer.frameLength.toInt()
        val floatData = buffer.floatChannelData?.get(0) ?: return ByteArray(0)
        val pcm = ByteArray(frameLength * 2)
        for (i in 0 until frameLength) {
            val floatVal = floatData[i]
            val shortVal = (floatVal * 32767.0f).coerceIn(-32768.0f, 32767.0f).toInt().toShort()
            pcm[i * 2] = (shortVal.toInt() and 0xFF).toByte()
            pcm[i * 2 + 1] = ((shortVal.toInt() shr 8) and 0xFF).toByte()
        }
        return pcm
    }
}
