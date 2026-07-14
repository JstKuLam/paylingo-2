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

export interface SonioxTranscriptToken {
  text: string
  is_final?: boolean
  language?: string
  translation_status?: 'original' | 'translation' | 'none'
  source_language?: string
  start_ms?: number
  end_ms?: number
}

const FILLER_WORDS = new Set([
  'uh', 'um', 'uhm', 'er', 'eh', 'ah', 'umm', 'uhhh', 'ummm',
  'ờ', 'ừm', 'ừ', 'ơ', 'hơ', 'ư', 'ưm', 'oh', 'a', 'ha'
])

const VIETNAMESE_ABBREVIATIONS: Record<string, string> = {
  'dng': 'dừng',
  'hn': 'hơn',
  'ko': 'không',
  'đc': 'được',
  'dc': 'được',
  'nhg': 'nhưng',
  'ng': 'người',
  'vs': 'với',
  'trc': 'trước',
  'đt': 'điện thoại',
  'kb': 'không biết',
  'thg': 'thường',
  'bth': 'bình thường'
}

function expandVietnameseAbbreviations(text: string): string {
  if (!text) return ''
  
  // Split into words, keeping track of punctuation
  return text.split(/\s+/).map(word => {
    // Strip trailing/leading punctuation for dictionary lookup
    const cleanWord = word.toLowerCase().normalize('NFC').replace(/[.,!?;:]/g, '')
    const replacement = VIETNAMESE_ABBREVIATIONS[cleanWord]
    
    if (replacement) {
      // Re-apply punctuation if any
      const punctuationMatch = word.match(/[.,!?;:]+$/)
      const punctuation = punctuationMatch ? punctuationMatch[0] : ''
      
      // Match case (capitalization) of original word
      if (word[0] === word[0].toUpperCase()) {
        return replacement[0].toUpperCase() + replacement.slice(1) + punctuation
      }
      return replacement + punctuation
    }
    return word
  }).join(' ')
}

function cleanTranscriptText(text: string): string {
  if (!text) return ''
  const expanded = expandVietnameseAbbreviations(text)
  return expanded
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
  finalTokens: readonly SonioxTranscriptToken[],
  partialTokens: readonly SonioxTranscriptToken[],
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
    const cleanTokenText = token.text.trim().toLowerCase().normalize('NFC').replace(/[.,!?;:]/g, '')
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
      
      const lastMsg = speaker === 'host' ? lastHostMessage : lastPartnerMessage

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
      const lastMsg = speaker === 'host' ? lastHostMessage : lastPartnerMessage

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
