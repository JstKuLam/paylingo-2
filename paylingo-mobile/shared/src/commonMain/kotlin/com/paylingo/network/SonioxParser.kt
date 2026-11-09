package com.paylingo.network

import com.paylingo.db.TranscriptMessage
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
data class SonioxStreamToken(
    val text: String = "",
    val is_final: Boolean = false,
    val start_ms: Long? = null,
    val end_ms: Long? = null,
    val language: String? = null,
    val translation_status: String? = null,
    val source_language: String? = null,
    val speaker: String? = null
)

@Serializable
data class SonioxStreamResponse(
    val tokens: List<SonioxStreamToken> = emptyList(),
    val finished: Boolean = false,
    val error_code: Int? = null,
    val error_message: String? = null
)

class SonioxParser(private val sessionId: String) {
    private val json = Json { ignoreUnknownKeys = true }
    private val finalTokens = mutableListOf<SonioxStreamToken>()
    private var partialTokens = emptyList<SonioxStreamToken>()

    companion object {
        private val FILLER_WORDS = setOf(
            "uh", "um", "umm", "uhh", "uhm", "hmm", "hm",
            "ừm", "ờm", "ưm"
        )

        private fun isFillerToken(raw: String): Boolean {
            val trimmed = raw.trim()
            if (trimmed.isEmpty()) return false
            // Only strip filler tokens when preceded by leading whitespace (word boundary),
            // so BPE subword continuations like "medi|um" or "alb|um" are never corrupted.
            if (!raw[0].isWhitespace()) return false
            val cleaned = trimmed.lowercase().replace(Regex("^[.,!?;:…\\-—]+|[.,!?;:…\\-—]+$"), "")
            return cleaned.isNotEmpty() && cleaned in FILLER_WORDS
        }
    }

    fun reset() {
        finalTokens.clear()
        partialTokens = emptyList()
    }

    /**
     * Parses a raw JSON frame from Soniox WebSocket and returns the updated list of TranscriptMessages.
     * Throws IllegalStateException if Soniox returns an error_code / error_message.
     */
    fun processFrame(rawJson: String): List<TranscriptMessage> {
        val response = try {
            json.decodeFromString<SonioxStreamResponse>(rawJson)
        } catch (_: Exception) {
            return buildMessages()
        }

        if (response.error_code != null || !response.error_message.isNullOrBlank()) {
            throw IllegalStateException(response.error_message ?: "Soniox error ${response.error_code}")
        }

        val nextPartials = mutableListOf<SonioxStreamToken>()
        for (token in response.tokens) {
            val trimmed = token.text.trim()
            if (token.text.isEmpty() || trimmed == "<end>" || trimmed == "<fin>") continue
            if (token.is_final) {
                finalTokens.add(token)
            } else {
                nextPartials.add(token)
            }
        }
        partialTokens = nextPartials
        return buildMessages()
    }

    fun buildMessages(): List<TranscriptMessage> {
        val allTokens = finalTokens + partialTokens
        if (allTokens.isEmpty()) return emptyList()

        data class MutableTurn(
            var speaker: String,
            var startMs: Long,
            var endMs: Long,
            val origBuilder: StringBuilder = StringBuilder(),
            val transBuilder: StringBuilder = StringBuilder(),
            var isFinal: Boolean = true
        )

        val turns = mutableListOf<MutableTurn>()
        var currentTurn: MutableTurn? = null
        var lastOriginalSpeaker: String? = null
        var hostTransCursor = 0
        var partnerTransCursor = 0
        var timeOffset = 0L
        var lastRawStart = 0L

        fun endsWithSentencePunct(sb: CharSequence): Boolean {
            var i = sb.length - 1
            while (i >= 0 && sb[i].isWhitespace()) i--
            if (i < 0) return false
            val c = sb[i]
            return c == '.' || c == '?' || c == '!' || c == '。' || c == '？' || c == '！' || c == '…'
        }

        for (token in allTokens) {
            val isTranslation = token.translation_status == "translation"
            if (!isTranslation && isFillerToken(token.text)) {
                continue
            }

            val rawStart = (token.start_ms ?: lastRawStart).coerceAtLeast(0L)
            var didReconnectReset = false
            if (!isTranslation && token.start_ms != null) {
                if (rawStart + 2000L < lastRawStart) {
                    timeOffset += lastRawStart
                    didReconnectReset = true
                }
                if (rawStart > lastRawStart || didReconnectReset) {
                    lastRawStart = rawStart
                }
            }
            val startMs = rawStart + timeOffset
            val endMs = ((token.end_ms ?: rawStart).coerceAtLeast(rawStart)) + timeOffset

            val lang = (if (isTranslation) token.source_language else token.language)?.lowercase()?.trim() ?: ""
            val speaker = if (lang == "vi") "host" else "partner"

            if (isTranslation) {
                var cursor = if (speaker == "host") hostTransCursor else partnerTransCursor
                var targetTurn: MutableTurn? = null
                while (cursor < turns.size) {
                    val candidate = turns[cursor]
                    if (candidate.speaker != speaker) {
                        cursor++
                        continue
                    }
                    val hasLaterTurnForSpeaker = (cursor + 1 until turns.size).any { turns[it].speaker == speaker }
                    if (!hasLaterTurnForSpeaker) {
                        targetTurn = candidate
                        break
                    }
                    if (candidate.origBuilder.isEmpty()) {
                        cursor++
                        continue
                    }
                    val origEnded = endsWithSentencePunct(candidate.origBuilder)
                    val transEnded = endsWithSentencePunct(candidate.transBuilder)
                    if (transEnded) {
                        cursor++
                        if (!origEnded) {
                            while (cursor < turns.size) {
                                val cont = turns[cursor]
                                if (cont.speaker != speaker) {
                                    cursor++
                                    continue
                                }
                                val hasMoreAfterCont = (cursor + 1 until turns.size).any { turns[it].speaker == speaker }
                                if (!hasMoreAfterCont || cont.transBuilder.isNotEmpty()) break
                                val contEnded = endsWithSentencePunct(cont.origBuilder)
                                cursor++
                                if (contEnded) break
                            }
                        }
                        continue
                    }
                    targetTurn = candidate
                    break
                }
                if (speaker == "host") hostTransCursor = cursor else partnerTransCursor = cursor
                val resolvedTurn = targetTurn ?: turns.lastOrNull { it.speaker == speaker } ?: currentTurn
                if (resolvedTurn != null) {
                    resolvedTurn.transBuilder.append(token.text)
                    if (!token.is_final) resolvedTurn.isFinal = false
                } else {
                    val created = MutableTurn(
                        speaker = speaker,
                        startMs = startMs,
                        endMs = endMs,
                        isFinal = token.is_final
                    )
                    created.transBuilder.append(token.text)
                    turns.add(created)
                    currentTurn = created
                }
            } else {
                val prevSpeakerTurn = turns.lastOrNull { it.speaker == speaker }
                val silenceGapMs = if (prevSpeakerTurn != null) startMs - prevSpeakerTurn.endMs else 0L
                val pauseShouldSplit = prevSpeakerTurn != null &&
                    silenceGapMs > 2400L &&
                    (didReconnectReset ||
                        prevSpeakerTurn.transBuilder.isNotEmpty() ||
                        prevSpeakerTurn.origBuilder.length >= 120 ||
                        silenceGapMs > 6000L)

                val shouldStartNewTurn = prevSpeakerTurn == null ||
                    (lastOriginalSpeaker != null && lastOriginalSpeaker != speaker) ||
                    (endsWithSentencePunct(prevSpeakerTurn.origBuilder) && prevSpeakerTurn.origBuilder.length >= 2) ||
                    pauseShouldSplit ||
                    prevSpeakerTurn.origBuilder.length > 360
                lastOriginalSpeaker = speaker

                if (shouldStartNewTurn) {
                    if (
                        prevSpeakerTurn != null &&
                        prevSpeakerTurn.transBuilder.isNotEmpty() &&
                        (pauseShouldSplit ||
                            didReconnectReset ||
                            endsWithSentencePunct(prevSpeakerTurn.origBuilder) ||
                            endsWithSentencePunct(prevSpeakerTurn.transBuilder))
                    ) {
                        if (speaker == "host") hostTransCursor = turns.size else partnerTransCursor = turns.size
                    }
                    val created = MutableTurn(
                        speaker = speaker,
                        startMs = startMs,
                        endMs = endMs,
                        isFinal = token.is_final
                    )
                    created.origBuilder.append(token.text)
                    turns.add(created)
                    currentTurn = created
                } else {
                    val active = prevSpeakerTurn
                    active.origBuilder.append(token.text)
                    if (endMs > active.endMs) active.endMs = endMs
                    if (!token.is_final) active.isFinal = false
                    currentTurn = active
                }
            }
        }

        return turns.mapIndexedNotNull { idx, turn ->
            val orig = turn.origBuilder.toString().trim()
            val trans = turn.transBuilder.toString().trim()
            if (orig.isEmpty() && trans.isEmpty()) {
                null
            } else {
                TranscriptMessage(
                    id = "${sessionId}_turn_${idx}_${turn.startMs}",
                    sessionId = sessionId,
                    text = orig.ifEmpty { trans },
                    translation = trans.ifEmpty { null },
                    speaker = turn.speaker,
                    startMs = turn.startMs,
                    endMs = turn.endMs,
                    isFinal = if (turn.isFinal) 1L else 0L
                )
            }
        }
    }
}
