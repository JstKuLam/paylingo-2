package com.paylingo.audio

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import com.paylingo.utils.AppLog
import java.util.concurrent.atomic.AtomicBoolean

class AndroidAudioRecorder : AudioRecorder {
    private var audioRecord: AudioRecord? = null
    private val isRecording = AtomicBoolean(false)
    private val scope = CoroutineScope(Dispatchers.IO)
    private val _audioFlow = MutableSharedFlow<ByteArray>(extraBufferCapacity = 64)

    private val sampleRate = 16000
    private val channelConfig = AudioFormat.CHANNEL_IN_MONO
    private val audioFormat = AudioFormat.ENCODING_PCM_16BIT
    private val bufferSize = AudioRecord.getMinBufferSize(sampleRate, channelConfig, audioFormat)

    @SuppressLint("MissingPermission")
    override fun startRecording(): Flow<ByteArray> {
        if (isRecording.getAndSet(true)) {
            AppLog.d("AndroidAudioRecorder", "Already recording, returning active audio flow")
            return _audioFlow.asSharedFlow()
        }

        AppLog.d("AndroidAudioRecorder", "Configuring AudioRecord: rate=$sampleRate, bufferSize=$bufferSize")
        try {
            audioRecord = AudioRecord(
                MediaRecorder.AudioSource.MIC,
                sampleRate,
                channelConfig,
                audioFormat,
                bufferSize
            )
            AppLog.d("AndroidAudioRecorder", "AudioRecord state: ${audioRecord?.state}")
            if (audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
                AppLog.e("AndroidAudioRecorder", "ERROR: AudioRecord initialization failed (STATE_UNINITIALIZED)!")
                throw IllegalStateException("AudioRecord is uninitialized. Verify runtime microphone permissions are granted.")
            }
            
            AppLog.d("AndroidAudioRecorder", "Starting hardware recording tap...")
            audioRecord?.startRecording()
            AppLog.d("AndroidAudioRecorder", "Hardware recording tap active.")
        } catch (e: Exception) {
            AppLog.e("AndroidAudioRecorder", "CRITICAL: AudioRecord startRecording exception occurred!", e)
            isRecording.set(false)
            throw e
        }

        scope.launch {
            val buffer = ByteArray(bufferSize)
            AppLog.d("AndroidAudioRecorder", "Audio read loop started in background...")
            while (isRecording.get()) {
                val readBytes = audioRecord?.read(buffer, 0, buffer.size) ?: -1
                if (readBytes > 0) {
                    val chunk = buffer.copyOf(readBytes)
                    _audioFlow.emit(chunk)
                }
            }
        }

        return _audioFlow.asSharedFlow()
    }

    override fun stopRecording() {
        if (!isRecording.getAndSet(false)) return
        AppLog.d("AndroidAudioRecorder", "Stopping recording tap...")
        try {
            audioRecord?.stop()
            audioRecord?.release()
            AppLog.d("AndroidAudioRecorder", "Recording stopped and hardware resources released successfully.")
        } catch (e: Exception) {
            AppLog.e("AndroidAudioRecorder", "Exception during stopRecording!", e)
        } finally {
            audioRecord = null
        }
    }
}
