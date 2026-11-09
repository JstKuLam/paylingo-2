package com.paylingo.network

import kotlinx.serialization.Serializable

@Serializable
data class SonioxContextGeneralItem(
    val key: String,
    val value: String
)

@Serializable
data class SonioxContextConfig(
    val general: List<SonioxContextGeneralItem> = listOf(
        SonioxContextGeneralItem(key = "app", value = "PayLingo Bilingual Interpretation")
    ),
    val terms: List<String> = listOf("PayLingo", "Soniox")
)

@Serializable
data class SonioxInitialRequest(
    val api_key: String,
    val model: String = "stt-rt-v6",
    val audio_format: String = "pcm_s16le",
    val sample_rate: Int = 16000,
    val num_channels: Int = 1,
    val enable_language_identification: Boolean = true,
    val enable_speaker_diarization: Boolean = true,
    val enable_endpoint_detection: Boolean = true,
    val max_endpoint_delay_ms: Int = 1200,
    val context: SonioxContextConfig = SonioxContextConfig(),
    val language_hints: List<String>,
    val language_hints_strict: Boolean,
    val translation: SonioxTranslationConfig? = null
)

@Serializable
data class SonioxTranslationConfig(
    val type: String, // "one_way" or "two_way"
    val target_language: String? = null,
    val language_a: String? = null,
    val language_b: String? = null
)
