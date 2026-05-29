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

function appendTokenText(currentText: string, tokenText: string, gap: number, isVietnamese: boolean): string {
  const cleanTokenText = tokenText.trim()
  if (!cleanTokenText) return currentText

  const needsSpace = (str: string, wordStr: string) => {
    if (!str) return false
    if (str.endsWith(' ') || wordStr.startsWith(' ')) return false
    
    // No space for CJK languages or Thai
    const isCJKOrThai = /[\u4e00-\u9fa5\u3040-\u309f\u30a0-\u30ff\u0e00-\u0e7f]/
    if (isCJKOrThai.test(str) && isCJKOrThai.test(wordStr)) return false
    
    // For non-Vietnamese languages (like English), always add space between separate words!
    if (!isVietnamese) {
      const isPunctuation = /^[.,!?;:]/.test(wordStr)
      if (isPunctuation) return false
      return true
    }

    // For Vietnamese:
    const lastWord = str.split(' ').pop() || ''
    const cleanLast = lastWord.toLowerCase().replace(/[^a-zà-ỹđ]/g, '')
    const cleanCurr = wordStr.toLowerCase().replace(/[^a-zà-ỹđ]/g, '')
    
    if (!cleanLast || !cleanCurr) return false

    // Initial consonants that cannot stand alone as words
    const INITIAL_CONSONANTS = new Set([
      'b', 'c', 'ch', 'd', 'đ', 'g', 'gh', 'gi', 'h', 'k', 'kh', 'l', 'm', 'n', 'nh', 'p', 'ph', 'q', 'r', 's', 't', 'th', 'tr', 'v', 'x', 'ng'
    ])

    // Final consonants that cannot stand alone as words
    const FINAL_CONSONANTS = new Set([
      'ng', 'nh', 'ch'
    ])

    // Standalone single-letter words in Vietnamese
    const STANDALONE_SINGLE_LETTERS = new Set([
      'a', 'y', 'ở', 'o', 'à'
    ])

    // Rule 1: Always glue if the previous word is a standalone initial consonant fragment (e.g., ch, đ, m, t, n)
    if (INITIAL_CONSONANTS.has(cleanLast)) {
      return false // GLUE!
    }

    // Rule 2: Glue if the current token is a final consonant or a split vowel/rime fragment spoken within a syllable window
    if (gap <= 150) {
      // 2a. If current token is a final consonant
      if (FINAL_CONSONANTS.has(cleanCurr)) {
        return false // GLUE!
      }
      
      // 2b. If current token is a single vowel/rime fragment and is NOT a standalone single-letter word
      if (cleanCurr.length === 1 && !STANDALONE_SINGLE_LETTERS.has(cleanCurr)) {
        return false // GLUE!
      }
    }
    
    return true
  }

  const space = needsSpace(currentText, cleanTokenText) ? ' ' : ''
  return (currentText + space + cleanTokenText).normalize('NFC')
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
    if (!token.text || !token.text.trim()) continue

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

    // Check if the current token language is Vietnamese
    const isVietnamese = token.translation_status === 'translation' 
      ? token.source_language !== 'vi' // translation is to 'vi'
      : token.language === 'vi'

    if (isOriginal) {
      const startMs = token.start_ms ?? 0
      const endMs = token.end_ms ?? 0
      
      let lastMsg = speaker === 'host' ? lastHostMessage : lastPartnerMessage

      const shouldStartNew =
        !lastMsg ||
        startMs - lastMsg.end_ms > SILENCE_THRESHOLD_MS ||
        SENTENCE_END_REGEX.test(lastMsg.original_text.trim())

      if (shouldStartNew) {
        const newMsg: TranscriptMessage = {
          id: `msg-${speaker}-${startMs}`,
          speaker,
          original_text: tokenText.trim(),
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
        const gap = startMs - lastMsg.end_ms
        lastMsg.original_text = appendTokenText(lastMsg.original_text, tokenText, gap, isVietnamese)
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
        const newMsg: TranscriptMessage = {
          id: `msg-${speaker}-${startMs}`,
          speaker,
          original_text: '',
          translated_text: tokenText.trim(),
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
        // Append translation text (gap is 9999 as it's a translation and not acoustically connected)
        const isTranslationVietnamese = speaker === 'partner' // partner translation is into 'vi'
        lastMsg.translated_text = appendTokenText(lastMsg.translated_text, tokenText, 9999, isTranslationVietnamese)
        if (!token.is_final) {
          lastMsg.is_final = false
        }
      }
    }
  }

  // Combine and sort chronologically by start_ms
  return [...hostMessages, ...partnerMessages].sort((a, b) => a.start_ms - b.start_ms)
}
