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

interface SpokenWord {
  start_ms: number
  end_ms: number
  is_final: boolean
  original: string
  translated: string
  speaker: 'host' | 'partner'
}

/**
 * Parses Soniox v4 two-way translation tokens into structured conversation messages.
 * Groups consecutive words by speaker, sentence boundaries, and silence thresholds.
 */
export function parseTokensToMessages(
  finalTokens: readonly any[],
  partialTokens: readonly any[],
  partnerLanguage: string
): TranscriptMessage[] {
  const allTokens = [...finalTokens, ...partialTokens]
  if (allTokens.length === 0) return []

  // 1. Group tokens by start_ms to pair original and translated tokens
  const wordMap = new Map<number, SpokenWord>()

  for (const token of allTokens) {
    const start = token.start_ms
    const isOriginal = token.translation_status === 'original' || token.translation_status === 'none'
    const isTranslation = token.translation_status === 'translation'

    let word = wordMap.get(start)
    if (!word) {
      word = {
        start_ms: token.start_ms,
        end_ms: token.end_ms,
        is_final: !!token.is_final,
        original: '',
        translated: '',
        speaker: 'host', // Default
      }
      wordMap.set(start, word)
    }

    // Update finality (any token final makes it final)
    if (token.is_final) {
      word.is_final = true
    }

    if (isOriginal) {
      word.original = token.text
      // Determine speaker: if original text is in Vietnamese, speaker is Host
      const lang = (token.language || 'vi').toLowerCase()
      word.speaker = lang === 'vi' ? 'host' : 'partner'
    } else if (isTranslation) {
      word.translated = token.text
      // If we only have translation token (rare case), check original source language
      const srcLang = (token.source_language || 'en').toLowerCase()
      word.speaker = srcLang === 'vi' ? 'host' : 'partner'
    } else {
      // Fallback
      word.original = token.text
      word.speaker = (token.language || 'vi').toLowerCase() === 'vi' ? 'host' : 'partner'
    }
  }

  // 2. Sort words chronologically by start_ms
  const sortedWords = Array.from(wordMap.values()).sort((a, b) => a.start_ms - b.start_ms)

  // 3. Assemble words into structured messages
  const messages: TranscriptMessage[] = []
  let currentMessage: TranscriptMessage | null = null

  const SENTENCE_END_REGEX = /[.!?。？！]$/
  const SILENCE_THRESHOLD_MS = 1500 // 1.5 seconds gap starts a new message

  for (const word of sortedWords) {
    // If the word doesn't have original/translated texts, skip empty tokens
    if (!word.original.trim() && !word.translated.trim()) continue

    const shouldStartNew =
      !currentMessage ||
      currentMessage.speaker !== word.speaker ||
      word.start_ms - currentMessage.end_ms > SILENCE_THRESHOLD_MS ||
      SENTENCE_END_REGEX.test(currentMessage.original_text.trim())

    if (shouldStartNew) {
      if (currentMessage) {
        messages.push(currentMessage)
      }
      currentMessage = {
        id: `msg-${word.start_ms}`,
        speaker: word.speaker,
        original_text: word.original,
        translated_text: word.translated,
        start_ms: word.start_ms,
        end_ms: word.end_ms,
        is_final: word.is_final,
      }
    } else if (currentMessage) {
      // Append word to current message
      // Add spaces appropriately (prevent double spaces, timing gap checking, and syllable-level merging for Vietnamese)
      const gap = word.start_ms - currentMessage.end_ms

      const needsSpace = (str: string, wordStr: string) => {
        if (!str) return false
        if (str.endsWith(' ') || wordStr.startsWith(' ')) return false
        
        // No space for CJK languages or Thai
        const isCJKOrThai = /[\u4e00-\u9fa5\u3040-\u309f\u30a0-\u30ff\u0e00-\u0e7f]/
        if (isCJKOrThai.test(str) && isCJKOrThai.test(wordStr)) return false
        
        const lastWord = str.split(' ').pop() || ''
        const cleanLastWord = lastWord.replace(/[^a-zA-ZÀ-ỹđĐ]/g, '')
        const cleanWordStr = wordStr.replace(/[^a-zA-ZÀ-ỹđĐ]/g, '')
        
        if (!cleanLastWord || !cleanWordStr) return false

        // Timing gap check: if very small (continuous speech of a decomposed syllable), no space
        if (gap <= 100) {
          if (cleanLastWord.length <= 2 || cleanWordStr.length <= 2) {
            return false
          }
        }
        
        // Subword check for Vietnamese (either is very short and not standalone)
        const standaloneWords = ['a', 'i', 'y', 'ở', 'o', 'à', 'A', 'I', 'Y', 'Ở', 'O', 'À']
        const isPrevStandalone = standaloneWords.includes(cleanLastWord)
        const isCurrStandalone = standaloneWords.includes(cleanWordStr)
        
        if ((cleanLastWord.length === 1 && !isPrevStandalone) || 
            (cleanWordStr.length === 1 && !isCurrStandalone)) {
          return false
        }
        
        return true
      }

      const origSpace = needsSpace(currentMessage.original_text, word.original) ? ' ' : ''
      currentMessage.original_text = (currentMessage.original_text + origSpace + word.original).normalize('NFC')

      const transSpace = needsSpace(currentMessage.translated_text, word.translated) ? ' ' : ''
      currentMessage.translated_text = (currentMessage.translated_text + transSpace + word.translated).normalize('NFC')

      currentMessage.end_ms = word.end_ms
      // If any word in the chunk is still partial, the message is partial
      currentMessage.is_final = currentMessage.is_final && word.is_final
    }
  }

  if (currentMessage) {
    messages.push(currentMessage)
  }

  return messages
}
