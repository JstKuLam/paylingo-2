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

export function getPartnerLanguage(code: string) {
  return PARTNER_LANGUAGES.find((language) => language.code === code)
}
