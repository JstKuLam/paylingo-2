export interface SonioxToken {
  text: string
  is_final?: boolean
  language?: string
  speaker?: string
  translation_status?: 'original' | 'translation' | 'none'
  source_language?: string
  start_ms: number
  end_ms: number
}

export interface TranscriptMessage {
  id: string
  speaker: 'host' | 'partner'
  speaker_label?: string
  original_text: string
  translated_text: string
  start_ms: number
  end_ms: number
  is_final: boolean
}

export interface SonioxTranscriptToken {
  text: string
  is_final?: boolean
  language?: string
  speaker?: string
  translation_status?: 'original' | 'translation' | 'none'
  source_language?: string
  start_ms?: number
  end_ms?: number
}

const FILLER_WORDS = new Set([
  'uh', 'um', 'uhm', 'umm', 'uhhh', 'ummm',
  'ừm', 'ờm', 'ưm'
])

function cleanTranscriptText(text: string): string {
  if (!text) return ''
  return text
    .replace(/\s+/g, ' ')                  // collapse multiple spaces
    .replace(/\s+([.,!?;:])/g, '$1')       // remove space before any punctuation
    .trim()
    .normalize('NFC')
}

/**
 * Parses Soniox v6 two-way and one-way translation tokens into structured conversation messages.
 * Groups consecutive words by speaker, speaker diarization label, sentence boundaries, and silence thresholds.
 * Seamlessly pairs translation tokens (which lack start_ms) with their corresponding original tokens.
 */
export function parseTokensToMessages(
  finalTokens: readonly SonioxTranscriptToken[],
  partialTokens: readonly SonioxTranscriptToken[],
): TranscriptMessage[] {
  const allTokens = [...finalTokens, ...partialTokens]
  if (allTokens.length === 0) return []

  const hostMessages: TranscriptMessage[] = []
  const partnerMessages: TranscriptMessage[] = []

  let lastHostMessage: TranscriptMessage | null = null
  let lastPartnerMessage: TranscriptMessage | null = null
  let lastOriginalSpeaker: 'host' | 'partner' | null = null
  let hostTransCursor = 0
  let partnerTransCursor = 0

  const SENTENCE_END_REGEX = /[.!?。？！…]+['"”’)\]]*$/
  const CLAUSE_END_REGEX = /[,;，；:：、—–-]['"”’)\]]*$/
  const CJK_START_REGEX = /^[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/
  const SILENCE_THRESHOLD_MS = 1500 // 1.5 seconds gap starts a new message
  const SOFT_CLAUSE_CHAR_LIMIT = 100
  const HARD_TURN_CHAR_LIMIT = 180
  let timeOffsetMs = 0
  let segmentMaxEndMs = 0
  let lastRawStartMs = 0
  let pendingEndpointSplit = false
  const completedTranslations = new Set<string>()
  const forcedSplitMessages = new Set<string>()

  for (let i = 0; i < allTokens.length; i++) {
    const token = allTokens[i]
    if (!token.text) continue
    const trimmedToken = token.text.trim()
    if (trimmedToken === '<end>' || trimmedToken === '<fin>') {
      pendingEndpointSplit = true
      if (lastHostMessage && lastHostMessage.translated_text.trim().length > 0) {
        completedTranslations.add(lastHostMessage.id)
      }
      if (lastPartnerMessage && lastPartnerMessage.translated_text.trim().length > 0) {
        completedTranslations.add(lastPartnerMessage.id)
      }
      continue
    }

    const rawTokenStart =
      typeof token.start_ms === 'number' && Number.isFinite(token.start_ms)
        ? Math.max(0, token.start_ms)
        : null
    const rawTokenEnd =
      typeof token.end_ms === 'number' && Number.isFinite(token.end_ms)
        ? Math.max(rawTokenStart ?? 0, token.end_ms)
        : null

    let didReconnectReset = false
    if (rawTokenStart !== null) {
      if (rawTokenStart + 100 < lastRawStartMs) {
        timeOffsetMs += segmentMaxEndMs + SILENCE_THRESHOLD_MS + 1
        segmentMaxEndMs = 0
        didReconnectReset = true
      }
      lastRawStartMs = rawTokenStart
      segmentMaxEndMs = Math.max(segmentMaxEndMs, rawTokenEnd ?? rawTokenStart)
    }

    // Filter out isolated filler words ("uh", "um", "ừm", etc.) only on original speech tokens
    // while preserving BPE subwords inside real words (e.g., "medi" + "um" or "um" + "brella").
    if (token.translation_status !== 'translation') {
      const cleanTokenText = token.text.trim().toLowerCase().normalize('NFC').replace(/[.,!?;:]/g, '')
      if (FILLER_WORDS.has(cleanTokenText)) {
        const prevToken = i > 0 ? allTokens[i - 1] : null
        const nextToken = i + 1 < allTokens.length ? allTokens[i + 1] : null
        const isAttachedToPrevWord = Boolean(
          prevToken &&
            prevToken.translation_status !== 'translation' &&
            !token.text.startsWith(' ') &&
            /[a-zA-ZÀ-ỹ]$/.test(prevToken.text)
        )
        const isAttachedToNextWord = Boolean(
          nextToken &&
            nextToken.translation_status !== 'translation' &&
            !nextToken.text.startsWith(' ') &&
            /^[a-zà-ỹ]/.test(nextToken.text)
        )
        if (!isAttachedToPrevWord && !isAttachedToNextWord) {
          continue
        }
      }
    }

    // 1. Determine the speaker of this token
    let speaker: 'host' | 'partner' = 'host'
    if (token.translation_status === 'translation') {
      if (token.source_language === 'vi') {
        speaker = 'host'
      } else {
        speaker = 'partner'
      }
    } else {
      if (token.language === 'vi') {
        speaker = 'host'
      } else {
        speaker = 'partner'
      }
    }

    const isOriginal = token.translation_status !== 'translation'
    const tokenText = token.text
    const tokenSpeakerLabel =
      typeof token.speaker === 'string' && token.speaker.trim() ? token.speaker.trim() : undefined

    if (isOriginal) {
      const lastMsg = speaker === 'host' ? lastHostMessage : lastPartnerMessage
      const rawStart = rawTokenStart !== null ? rawTokenStart + timeOffsetMs : null
      const startMs = rawStart ?? (lastMsg ? lastMsg.end_ms : timeOffsetMs)
      const rawEnd = rawTokenEnd !== null ? Math.max(startMs, rawTokenEnd + timeOffsetMs) : null
      const endMs = rawEnd ?? startMs

      const speakerLabelChanged = Boolean(
        lastMsg?.speaker_label && tokenSpeakerLabel && lastMsg.speaker_label !== tokenSpeakerLabel
      )
      const interleavedOtherSpeaker = Boolean(
        lastOriginalSpeaker !== null && lastOriginalSpeaker !== speaker && lastMsg && startMs > lastMsg.end_ms
      )
      const silenceGapMs = lastMsg ? startMs - lastMsg.end_ms : 0
      const trimmedOrig = lastMsg ? lastMsg.original_text.trim() : ''
      // Split on natural silence (>1.5s) once a clause has >=45 chars, already received translation, or silence >3s,
      // while keeping short (<45 char) mid-sentence hesitations ("Chúng tôi muốn ... giảm giá 10%.") aligned.
      const pauseShouldSplit = Boolean(
        lastMsg &&
          silenceGapMs > SILENCE_THRESHOLD_MS &&
          (didReconnectReset ||
            lastMsg.translated_text.length > 0 ||
            trimmedOrig.length >= 45 ||
            silenceGapMs > 3000)
      )
      const clauseShouldSplit = Boolean(
        lastMsg &&
          CLAUSE_END_REGEX.test(trimmedOrig) &&
          (trimmedOrig.length >= SOFT_CLAUSE_CHAR_LIMIT ||
            (trimmedOrig.length >= 50 && silenceGapMs >= 800))
      )
      const isWordBoundary = tokenText.startsWith(' ') || CJK_START_REGEX.test(tokenText)
      const maxLengthShouldSplit = Boolean(
        lastMsg && trimmedOrig.length >= HARD_TURN_CHAR_LIMIT && isWordBoundary
      )

      const shouldStartNew =
        !lastMsg ||
        pendingEndpointSplit ||
        speakerLabelChanged ||
        interleavedOtherSpeaker ||
        pauseShouldSplit ||
        clauseShouldSplit ||
        maxLengthShouldSplit ||
        SENTENCE_END_REGEX.test(trimmedOrig)

      lastOriginalSpeaker = speaker

      if (shouldStartNew) {
        if (
          lastMsg &&
          (pendingEndpointSplit || pauseShouldSplit || clauseShouldSplit || maxLengthShouldSplit)
        ) {
          forcedSplitMessages.add(lastMsg.id)
        }
        pendingEndpointSplit = false
        const initialText = tokenText.startsWith(' ') ? tokenText.slice(1) : tokenText
        const targetList = speaker === 'host' ? hostMessages : partnerMessages
        if (
          lastMsg &&
          lastMsg.translated_text.trim().length > 0 &&
          (pauseShouldSplit ||
            clauseShouldSplit ||
            maxLengthShouldSplit ||
            didReconnectReset ||
            forcedSplitMessages.has(lastMsg.id) ||
            SENTENCE_END_REGEX.test(trimmedOrig) ||
            SENTENCE_END_REGEX.test(lastMsg.translated_text.trim()))
        ) {
          completedTranslations.add(lastMsg.id)
          if (speaker === 'host') {
            hostTransCursor = targetList.length
          } else {
            partnerTransCursor = targetList.length
          }
        }
        const msgId =
          lastMsg && lastMsg.start_ms === startMs
            ? `msg-${speaker}-${startMs}-${targetList.length}`
            : `msg-${speaker}-${startMs}`
        const newMsg: TranscriptMessage = {
          id: msgId,
          speaker,
          speaker_label: tokenSpeakerLabel,
          original_text: initialText,
          translated_text: '',
          start_ms: startMs,
          end_ms: endMs,
          is_final: !!token.is_final,
        }

        if (speaker === 'host') {
          hostMessages.push(newMsg)
          lastHostMessage = newMsg
        } else {
          partnerMessages.push(newMsg)
          lastPartnerMessage = newMsg
        }
      } else {
        lastMsg.original_text += tokenText
        lastMsg.end_ms = Math.max(lastMsg.end_ms, endMs)
        if (!lastMsg.speaker_label && tokenSpeakerLabel) {
          lastMsg.speaker_label = tokenSpeakerLabel
        }
        if (!token.is_final) {
          lastMsg.is_final = false
        }
      }
    } else {
      // O(1) amortized sentence-aligned translation cursor routing
      const targetList = speaker === 'host' ? hostMessages : partnerMessages
      let cursor = speaker === 'host' ? hostTransCursor : partnerTransCursor
      while (cursor < targetList.length - 1) {
        const candidate = targetList[cursor]
        if (candidate.original_text.trim().length === 0) {
          cursor++
          continue
        }
        const origEnded = SENTENCE_END_REGEX.test(candidate.original_text.trim())
        const trimmedTrans = candidate.translated_text.trim()
        const transEnded =
          completedTranslations.has(candidate.id) ||
          SENTENCE_END_REGEX.test(trimmedTrans) ||
          (forcedSplitMessages.has(candidate.id) &&
            CLAUSE_END_REGEX.test(trimmedTrans) &&
            trimmedTrans.length >= 50)
        if (transEnded) {
          cursor++
          if (!origEnded && !forcedSplitMessages.has(candidate.id)) {
            while (
              cursor < targetList.length - 1 &&
              targetList[cursor].translated_text.trim().length === 0
            ) {
              const contEnded =
                SENTENCE_END_REGEX.test(targetList[cursor].original_text.trim()) ||
                forcedSplitMessages.has(targetList[cursor].id)
              cursor++
              if (contEnded) break
            }
          }
          continue
        }
        break
      }
      if (speaker === 'host') {
        hostTransCursor = cursor
      } else {
        partnerTransCursor = cursor
      }
      const pendingTranslationMsg =
        targetList[cursor] ?? (speaker === 'host' ? lastHostMessage : lastPartnerMessage)

      if (!pendingTranslationMsg) {
        // Fallback: if no original message exists yet, create a placeholder
        const rawStart = rawTokenStart !== null ? rawTokenStart + timeOffsetMs : null
        const startMs = rawStart ?? timeOffsetMs
        const rawEnd = rawTokenEnd !== null ? Math.max(startMs, rawTokenEnd + timeOffsetMs) : null
        const endMs = rawEnd ?? startMs
        const initialText = tokenText.startsWith(' ') ? tokenText.slice(1) : tokenText
        const newMsg: TranscriptMessage = {
          id: `msg-${speaker}-${startMs}`,
          speaker,
          original_text: '',
          translated_text: initialText,
          start_ms: startMs,
          end_ms: endMs,
          is_final: !!token.is_final,
        }

        if (speaker === 'host') {
          hostMessages.push(newMsg)
          lastHostMessage = newMsg
        } else {
          partnerMessages.push(newMsg)
          lastPartnerMessage = newMsg
        }
      } else {
        pendingTranslationMsg.translated_text += tokenText
        if (!token.is_final) {
          pendingTranslationMsg.is_final = false
        }
      }
    }
  }

  // Clean up spacing for all generated messages
  const allMessages = [...hostMessages, ...partnerMessages]
  for (const msg of allMessages) {
    msg.original_text = cleanTranscriptText(msg.original_text)
    msg.translated_text = cleanTranscriptText(msg.translated_text)
  }

  // Combine and sort chronologically by start_ms
  return allMessages.sort((a, b) => a.start_ms - b.start_ms)
}

/**
 * Generates a deterministic UUIDv4-compliant string from any input string.
 * Used to map client-side arbitrary message IDs to standard database UUID format.
 */
export function stringToUUID(str: string): string {
  let h1 = 1779033703
  let h2 = 3144134277
  let h3 = 1013904242
  let h4 = 2773480762

  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    h1 = h2 ^ Math.imul(h1 ^ code, 597399067)
    h2 = h3 ^ Math.imul(h2 ^ code, 2869860233)
    h3 = h4 ^ Math.imul(h3 ^ code, 951274213)
    h4 = h1 ^ Math.imul(h4 ^ code, 2716044179)
  }

  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)

  const bytes = new Uint8Array(16)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, (h1 ^ h2 ^ h3 ^ h4) >>> 0)
  view.setUint32(4, (h2 ^ h1) >>> 0)
  view.setUint32(8, (h3 ^ h1) >>> 0)
  view.setUint32(12, (h4 ^ h1) >>> 0)
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const seed = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return [
    seed.slice(0, 8),
    seed.slice(8, 12),
    seed.slice(12, 16),
    seed.slice(16, 20),
    seed.slice(20, 32)
  ].join('-')
}
