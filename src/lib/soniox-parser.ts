export interface SonioxToken {
  text: string
  is_final?: boolean
  language?: string
  translation_status?: 'original' | 'translation' | 'none'
  source_language?: string
  start_ms: number
  end_ms: number
}

export interface TranscriptMessage {
  id: string
  speaker: 'host' | 'partner'
  original_text: string
  translated_text: string
  start_ms: number
  end_ms: number
  is_final: boolean
}

const FILLER_WORDS = new Set([
  'uh', 'um', 'uhm', 'er', 'eh', 'ah', 'umm', 'uhhh', 'ummm',
  'ờ', 'ừm', 'ừ', 'ơ', 'hơ'
])

function cleanTranscriptText(text: string): string {
  if (!text) return ''
  return text
    .replace(/\s+/g, ' ')                  // collapse multiple spaces
    .replace(/\s+([.,!?;:])$/g, '$1')      // remove space before end punctuation
    .replace(/\s+([.,!?;:])\s+/g, '$1 ')   // remove space before punctuation but keep one after
    .trim()
    .normalize('NFC')
}

/**
 * Parses Soniox v4 two-way and one-way translation tokens into structured conversation messages.
 * Groups consecutive words by speaker, sentence boundaries, and silence thresholds.
 * Seamlessly pairs translation tokens (which lack start_ms) with their corresponding original tokens.
 */
export function parseTokensToMessages(
  finalTokens: readonly any[],
  partialTokens: readonly any[],
  partnerLanguage: string
): TranscriptMessage[] {
  const allTokens = [...finalTokens, ...partialTokens]
  if (allTokens.length === 0) return []

  const hostMessages: TranscriptMessage[] = []
  const partnerMessages: TranscriptMessage[] = []

  let lastHostMessage: TranscriptMessage | null = null
  let lastPartnerMessage: TranscriptMessage | null = null

  const SENTENCE_END_REGEX = /[.!?。？！]$/
  const SILENCE_THRESHOLD_MS = 1500 // 1.5 seconds gap starts a new message

  for (const token of allTokens) {
    if (!token.text) continue

    // Filter out filler words ("uh", "ờ", "ừm", etc.)
    const cleanTokenText = token.text.trim().toLowerCase().replace(/[.,!?;:]/g, '')
    if (FILLER_WORDS.has(cleanTokenText)) {
      continue
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

    if (isOriginal) {
      const startMs = token.start_ms ?? 0
      const endMs = token.end_ms ?? 0
      
      let lastMsg = speaker === 'host' ? lastHostMessage : lastPartnerMessage

      const shouldStartNew =
        !lastMsg ||
        startMs - lastMsg.end_ms > SILENCE_THRESHOLD_MS ||
        SENTENCE_END_REGEX.test(lastMsg.original_text.trim())

      if (shouldStartNew) {
        const initialText = tokenText.startsWith(' ') ? tokenText.slice(1) : tokenText
        const newMsg: TranscriptMessage = {
          id: `msg-${speaker}-${startMs}`,
          speaker,
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
        if (!token.is_final) {
          lastMsg.is_final = false
        }
      }
    } else {
      // Translation token
      let lastMsg = speaker === 'host' ? lastHostMessage : lastPartnerMessage

      if (!lastMsg) {
        // Fallback: if no original message exists yet, create a placeholder
        const startMs = Date.now()
        const initialText = tokenText.startsWith(' ') ? tokenText.slice(1) : tokenText
        const newMsg: TranscriptMessage = {
          id: `msg-${speaker}-${startMs}`,
          speaker,
          original_text: '',
          translated_text: initialText,
          start_ms: startMs,
          end_ms: startMs,
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
        lastMsg.translated_text += tokenText
        if (!token.is_final) {
          lastMsg.is_final = false
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
