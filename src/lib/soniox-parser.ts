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

function appendTokenText(currentText: string, tokenText: string, gap: number): string {
  const cleanTokenText = tokenText.trim()
  if (!cleanTokenText) return currentText

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
        lastMsg.original_text = appendTokenText(lastMsg.original_text, tokenText, gap)
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
        lastMsg.translated_text = appendTokenText(lastMsg.translated_text, tokenText, 9999)
        if (!token.is_final) {
          lastMsg.is_final = false
        }
      }
    }
  }

  // Combine and sort chronologically by start_ms
  return [...hostMessages, ...partnerMessages].sort((a, b) => a.start_ms - b.start_ms)
}
