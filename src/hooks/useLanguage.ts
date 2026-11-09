import { useSyncExternalStore } from 'react'
import { Language, translations, detectMachineLanguage, I18nTranslations } from '@/lib/i18n'

const LANGUAGE_EVENT = 'paylingo-language-change'
const STORAGE_KEY = 'paylingo_ui_lang'

function getLanguageSnapshot(): Language {
  if (typeof window === 'undefined') return 'vi'
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as Language | null
    if (saved && (saved === 'vi' || saved === 'en' || saved === 'zh')) {
      return saved
    }
  } catch {}
  const detected = detectMachineLanguage()
  return detected === 'zh' ? 'zh' : 'vi'
}

function subscribeToLanguage(callback: () => void) {
  if (typeof window === 'undefined') return () => undefined
  window.addEventListener('storage', callback)
  window.addEventListener(LANGUAGE_EVENT, callback)
  return () => {
    window.removeEventListener('storage', callback)
    window.removeEventListener(LANGUAGE_EVENT, callback)
  }
}

const proxyCache: Partial<Record<Language, I18nTranslations>> = {}

function getTranslationProxy(language: Language): I18nTranslations {
  const cached = proxyCache[language]
  if (cached) return cached
  const rawTranslations = translations[language] || translations.vi
  const proxy: I18nTranslations = new Proxy(rawTranslations, {
    get(target, prop: string | symbol) {
      if (typeof prop === 'string' && prop in target) {
        const val = target[prop as keyof I18nTranslations]
        if (val !== undefined && val !== '') return val
      }
      if (typeof prop === 'string' && prop in translations.vi) {
        const fallback = translations.vi[prop as keyof I18nTranslations]
        if (fallback !== undefined && fallback !== '') return fallback
      }
      return ''
    },
  })
  proxyCache[language] = proxy
  return proxy
}

export function useLanguage(): {
  language: Language
  changeLanguage: (newLang: Language) => void
  t: I18nTranslations
} {
  const language = useSyncExternalStore<Language>(subscribeToLanguage, getLanguageSnapshot, () => 'vi')

  const changeLanguage = (newLang: Language) => {
    const validLang: Language = newLang === 'vi' || newLang === 'en' || newLang === 'zh' ? newLang : 'vi'
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, validLang)
      }
    } catch {}
    if (typeof document !== 'undefined') {
      document.documentElement.lang = validLang
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(LANGUAGE_EVENT))
    }
  }

  const t = getTranslationProxy(language)

  return { language, changeLanguage, t }
}
