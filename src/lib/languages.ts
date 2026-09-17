import type { Language } from './i18n'

export interface PartnerLanguage {
  code: string
  name: string
  shortName: string
}

export const PARTNER_LANGUAGES: PartnerLanguage[] = [
  { code: 'any', name: 'Tự động nhận diện', shortName: 'AUTO' },
  { code: 'en', name: 'English', shortName: 'EN' },
  { code: 'zh', name: '中文', shortName: 'ZH' },
  { code: 'ja', name: '日本語', shortName: 'JA' },
  { code: 'ko', name: '한국어', shortName: 'KO' },
  { code: 'es', name: 'Español', shortName: 'ES' },
  { code: 'ru', name: 'Русский', shortName: 'RU' },
  { code: 'de', name: 'Deutsch', shortName: 'DE' },
  { code: 'th', name: 'ภาษาไทย', shortName: 'TH' },
]

export function getLocalizedPartnerLanguages(lang?: Language): PartnerLanguage[] {
  if (!lang || lang === 'vi') return PARTNER_LANGUAGES
  const autoName = lang === 'zh' ? '自动识别' : 'Auto Detect'
  return PARTNER_LANGUAGES.map((p) => (p.code === 'any' ? { ...p, name: autoName } : p))
}

export function getPartnerLanguage(code?: string | null, lang?: Language): PartnerLanguage | undefined {
  if (!code || typeof code !== 'string') return undefined
  const cleanCode = code.trim().toLowerCase()
  const list = getLocalizedPartnerLanguages(lang)
  return list.find((language) => language.code.toLowerCase() === cleanCode)
}
