package com.paylingo.audio

import kotlinx.coroutines.flow.Flow

interface AudioRecorder {
    fun startRecording(): Flow<ByteArray>
    fun stopRecording()
}
