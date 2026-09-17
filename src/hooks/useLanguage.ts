import { useSyncExternalStore } from 'react'
import { Language, translations, detectMachineLanguage, I18nTranslations } from '@/lib/i18n'

const LANGUAGE_EVENT = 'paylingo-language-change'
const STORAGE_KEY = 'paylingo_ui_lang'

function getLanguageSnapshot(): Language {
  if (typeof window === 'undefined') return 'vi'
  const saved = localStorage.getItem(STORAGE_KEY) as Language | null
  if (saved && (saved === 'vi' || saved === 'en' || saved === 'zh')) {
    return saved
  }
  return detectMachineLanguage()
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

export function useLanguage(): {
  language: Language
  changeLanguage: (newLang: Language) => void
  t: I18nTranslations
} {
  const language = useSyncExternalStore<Language>(subscribeToLanguage, getLanguageSnapshot, () => 'vi')

  const changeLanguage = (newLang: Language) => {
    const validLang: Language = newLang === 'vi' || newLang === 'en' || newLang === 'zh' ? newLang : 'vi'
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, validLang)
    }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = validLang
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(LANGUAGE_EVENT))
    }
  }

  const rawTranslations = translations[language] || translations.vi
  const t: I18nTranslations = language === 'vi'
    ? rawTranslations
    : new Proxy(rawTranslations, {
        get(target, prop: string | symbol) {
          if (typeof prop === 'string' && prop in target) {
            const val = target[prop as keyof I18nTranslations]
            if (val !== undefined && val !== '') return val
          }
          if (typeof prop === 'string' && prop in translations.vi) {
            return translations.vi[prop as keyof I18nTranslations]
          }
          return ''
        },
      })

  return { language, changeLanguage, t }
}
