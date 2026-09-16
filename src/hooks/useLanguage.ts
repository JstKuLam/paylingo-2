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
    localStorage.setItem(STORAGE_KEY, newLang)
    document.documentElement.lang = newLang
    window.dispatchEvent(new Event(LANGUAGE_EVENT))
  }

  const t = translations[language] || translations.vi

  return { language, changeLanguage, t }
}
