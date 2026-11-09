import type { Language } from './i18n'

export interface PartnerLanguage {
  code: string
  name: string
  shortName: string
  flagCode: string
  popular?: boolean
}

interface RawLanguageDefinition {
  code: string
  shortName: string
  flagCode: string
  popular?: boolean
  names: {
    vi: string
    en: string
    zh: string
  }
}

/**
 * Official Soniox Real-Time Speech-to-Text (stt-rt-v6) supported languages (60 languages)
 * mapped to authoritative ISO 3166-1 / CLDR flag codes (HatScripts/circle-flags).
 */
const SONIOX_LANGUAGE_DEFINITIONS: RawLanguageDefinition[] = [
  {
    code: 'any',
    shortName: 'AUTO',
    flagCode: 'globe',
    names: {
      vi: 'Tự động nhận diện',
      en: 'Auto Detect',
      zh: '自动识别',
    },
  },
  // Popular Partner Languages (ordered by popularity for Vietnamese & international meetings)
  {
    code: 'en',
    shortName: 'EN',
    flagCode: 'gb',
    popular: true,
    names: { vi: 'Anh', en: 'English', zh: '英语' },
  },
  {
    code: 'zh',
    shortName: 'ZH',
    flagCode: 'cn',
    popular: true,
    names: { vi: 'Trung', en: 'Chinese', zh: '中文' },
  },
  {
    code: 'ja',
    shortName: 'JA',
    flagCode: 'jp',
    popular: true,
    names: { vi: 'Nhật', en: 'Japanese', zh: '日语' },
  },
  {
    code: 'ko',
    shortName: 'KO',
    flagCode: 'kr',
    popular: true,
    names: { vi: 'Hàn', en: 'Korean', zh: '韩语' },
  },
  {
    code: 'fr',
    shortName: 'FR',
    flagCode: 'fr',
    popular: true,
    names: { vi: 'Pháp', en: 'French', zh: '法语' },
  },
  {
    code: 'de',
    shortName: 'DE',
    flagCode: 'de',
    popular: true,
    names: { vi: 'Đức', en: 'German', zh: '德语' },
  },
  {
    code: 'es',
    shortName: 'ES',
    flagCode: 'es',
    popular: true,
    names: { vi: 'Tây Ban Nha', en: 'Spanish', zh: '西班牙语' },
  },
  {
    code: 'ru',
    shortName: 'RU',
    flagCode: 'ru',
    popular: true,
    names: { vi: 'Nga', en: 'Russian', zh: '俄语' },
  },
  {
    code: 'th',
    shortName: 'TH',
    flagCode: 'th',
    popular: true,
    names: { vi: 'Thái', en: 'Thai', zh: '泰语' },
  },
  {
    code: 'id',
    shortName: 'ID',
    flagCode: 'id',
    popular: true,
    names: { vi: 'Indonesia', en: 'Indonesian', zh: '印度尼西亚语' },
  },
  {
    code: 'ms',
    shortName: 'MS',
    flagCode: 'my',
    popular: true,
    names: { vi: 'Mã Lai', en: 'Malay', zh: '马来语' },
  },
  {
    code: 'hi',
    shortName: 'HI',
    flagCode: 'in',
    popular: true,
    names: { vi: 'Hindi', en: 'Hindi', zh: '印地语' },
  },
  {
    code: 'ar',
    shortName: 'AR',
    flagCode: 'sa',
    popular: true,
    names: { vi: 'Ả Rập', en: 'Arabic', zh: '阿拉伯语' },
  },
  {
    code: 'pt',
    shortName: 'PT',
    flagCode: 'pt',
    popular: true,
    names: { vi: 'Bồ Đào Nha', en: 'Portuguese', zh: '葡萄牙语' },
  },
  {
    code: 'it',
    shortName: 'IT',
    flagCode: 'it',
    popular: true,
    names: { vi: 'Ý', en: 'Italian', zh: '意大利语' },
  },

  // Remaining Soniox-Supported Languages (44 languages, sorted A-Z dynamically per active UI language)
  {
    code: 'af',
    shortName: 'AF',
    flagCode: 'za',
    names: { vi: 'Afrikaans', en: 'Afrikaans', zh: '南非荷兰语' },
  },
  {
    code: 'sq',
    shortName: 'SQ',
    flagCode: 'al',
    names: { vi: 'Albania', en: 'Albanian', zh: '阿尔巴尼亚语' },
  },
  {
    code: 'az',
    shortName: 'AZ',
    flagCode: 'az',
    names: { vi: 'Azerbaijan', en: 'Azerbaijani', zh: '阿塞拜疆语' },
  },
  {
    code: 'eu',
    shortName: 'EU',
    flagCode: 'es-pv',
    names: { vi: 'Basque', en: 'Basque', zh: '巴斯克语' },
  },
  {
    code: 'be',
    shortName: 'BE',
    flagCode: 'by',
    names: { vi: 'Belarus', en: 'Belarusian', zh: '白俄罗斯语' },
  },
  {
    code: 'bn',
    shortName: 'BN',
    flagCode: 'bd',
    names: { vi: 'Bengal', en: 'Bengali', zh: '孟加拉语' },
  },
  {
    code: 'bs',
    shortName: 'BS',
    flagCode: 'ba',
    names: { vi: 'Bosnia', en: 'Bosnian', zh: '波斯尼亚语' },
  },
  {
    code: 'bg',
    shortName: 'BG',
    flagCode: 'bg',
    names: { vi: 'Bulgaria', en: 'Bulgarian', zh: '保加利亚语' },
  },
  {
    code: 'ca',
    shortName: 'CA',
    flagCode: 'es-ct',
    names: { vi: 'Catalan', en: 'Catalan', zh: '加泰罗尼亚语' },
  },
  {
    code: 'hr',
    shortName: 'HR',
    flagCode: 'hr',
    names: { vi: 'Croatia', en: 'Croatian', zh: '克罗地亚语' },
  },
  {
    code: 'cs',
    shortName: 'CS',
    flagCode: 'cz',
    names: { vi: 'Séc', en: 'Czech', zh: '捷克语' },
  },
  {
    code: 'da',
    shortName: 'DA',
    flagCode: 'dk',
    names: { vi: 'Đan Mạch', en: 'Danish', zh: '丹麦语' },
  },
  {
    code: 'nl',
    shortName: 'NL',
    flagCode: 'nl',
    names: { vi: 'Hà Lan', en: 'Dutch', zh: '荷兰语' },
  },
  {
    code: 'et',
    shortName: 'ET',
    flagCode: 'ee',
    names: { vi: 'Estonia', en: 'Estonian', zh: '爱沙尼亚语' },
  },
  {
    code: 'fi',
    shortName: 'FI',
    flagCode: 'fi',
    names: { vi: 'Phần Lan', en: 'Finnish', zh: '芬兰语' },
  },
  {
    code: 'gl',
    shortName: 'GL',
    flagCode: 'es-ga',
    names: { vi: 'Galicia', en: 'Galician', zh: '加利西亚语' },
  },
  {
    code: 'el',
    shortName: 'EL',
    flagCode: 'gr',
    names: { vi: 'Hy Lạp', en: 'Greek', zh: '希腊语' },
  },
  {
    code: 'gu',
    shortName: 'GU',
    flagCode: 'in',
    names: { vi: 'Gujarat', en: 'Gujarati', zh: '古吉拉特语' },
  },
  {
    code: 'he',
    shortName: 'HE',
    flagCode: 'il',
    names: { vi: 'Do Thái', en: 'Hebrew', zh: '希伯来语' },
  },
  {
    code: 'hu',
    shortName: 'HU',
    flagCode: 'hu',
    names: { vi: 'Hungary', en: 'Hungarian', zh: '匈牙利语' },
  },
  {
    code: 'kn',
    shortName: 'KN',
    flagCode: 'in',
    names: { vi: 'Kannada', en: 'Kannada', zh: '卡纳达语' },
  },
  {
    code: 'kk',
    shortName: 'KK',
    flagCode: 'kz',
    names: { vi: 'Kazakh', en: 'Kazakh', zh: '哈萨克语' },
  },
  {
    code: 'lv',
    shortName: 'LV',
    flagCode: 'lv',
    names: { vi: 'Latvia', en: 'Latvian', zh: '拉脱维亚语' },
  },
  {
    code: 'lt',
    shortName: 'LT',
    flagCode: 'lt',
    names: { vi: 'Litva', en: 'Lithuanian', zh: '立陶宛语' },
  },
  {
    code: 'mk',
    shortName: 'MK',
    flagCode: 'mk',
    names: { vi: 'Macedonia', en: 'Macedonian', zh: '马其顿语' },
  },
  {
    code: 'ml',
    shortName: 'ML',
    flagCode: 'in',
    names: { vi: 'Malayalam', en: 'Malayalam', zh: '马拉雅拉姆语' },
  },
  {
    code: 'mr',
    shortName: 'MR',
    flagCode: 'in',
    names: { vi: 'Marathi', en: 'Marathi', zh: '马拉地语' },
  },
  {
    code: 'no',
    shortName: 'NO',
    flagCode: 'no',
    names: { vi: 'Na Uy', en: 'Norwegian', zh: '挪威语' },
  },
  {
    code: 'fa',
    shortName: 'FA',
    flagCode: 'ir',
    names: { vi: 'Ba Tư', en: 'Persian', zh: '波斯语' },
  },
  {
    code: 'pl',
    shortName: 'PL',
    flagCode: 'pl',
    names: { vi: 'Ba Lan', en: 'Polish', zh: '波兰语' },
  },
  {
    code: 'pa',
    shortName: 'PA',
    flagCode: 'in',
    names: { vi: 'Punjab', en: 'Punjabi', zh: '旁遮普语' },
  },
  {
    code: 'ro',
    shortName: 'RO',
    flagCode: 'ro',
    names: { vi: 'Romania', en: 'Romanian', zh: '罗马尼亚语' },
  },
  {
    code: 'sr',
    shortName: 'SR',
    flagCode: 'rs',
    names: { vi: 'Serbia', en: 'Serbian', zh: '塞尔维亚语' },
  },
  {
    code: 'sk',
    shortName: 'SK',
    flagCode: 'sk',
    names: { vi: 'Slovakia', en: 'Slovak', zh: '斯洛伐克语' },
  },
  {
    code: 'sl',
    shortName: 'SL',
    flagCode: 'si',
    names: { vi: 'Slovenia', en: 'Slovenian', zh: '斯洛文尼亚语' },
  },
  {
    code: 'sw',
    shortName: 'SW',
    flagCode: 'ke',
    names: { vi: 'Swahili', en: 'Swahili', zh: '斯瓦希里语' },
  },
  {
    code: 'sv',
    shortName: 'SV',
    flagCode: 'se',
    names: { vi: 'Thụy Điển', en: 'Swedish', zh: '瑞典语' },
  },
  {
    code: 'tl',
    shortName: 'TL',
    flagCode: 'ph',
    names: { vi: 'Tagalog (Philippines)', en: 'Tagalog', zh: '塔加路语 (菲律宾)' },
  },
  {
    code: 'ta',
    shortName: 'TA',
    flagCode: 'in',
    names: { vi: 'Tamil', en: 'Tamil', zh: '泰米尔语' },
  },
  {
    code: 'te',
    shortName: 'TE',
    flagCode: 'in',
    names: { vi: 'Telugu', en: 'Telugu', zh: '泰卢固语' },
  },
  {
    code: 'tr',
    shortName: 'TR',
    flagCode: 'tr',
    names: { vi: 'Thổ Nhĩ Kỳ', en: 'Turkish', zh: '土耳其语' },
  },
  {
    code: 'uk',
    shortName: 'UK',
    flagCode: 'ua',
    names: { vi: 'Ukraina', en: 'Ukrainian', zh: '乌克兰语' },
  },
  {
    code: 'ur',
    shortName: 'UR',
    flagCode: 'pk',
    names: { vi: 'Urdu', en: 'Urdu', zh: '乌尔都语' },
  },
  {
    code: 'cy',
    shortName: 'CY',
    flagCode: 'gb-wls',
    names: { vi: 'Wales', en: 'Welsh', zh: '威尔士语' },
  },
]

const FLAG_MAP: Record<string, string> = {
  vi: 'vn',
  ...Object.fromEntries(SONIOX_LANGUAGE_DEFINITIONS.map((d) => [d.code, d.flagCode])),
}

export function getFlagCountryCode(languageCode?: string | null): string {
  const clean = (languageCode || 'any').trim().toLowerCase()
  return FLAG_MAP[clean] || 'globe'
}

function getSortKey(name: string, lang: Language): string {
  if (lang === 'vi') {
    return name.replace(/^Tiếng\s+/i, '').trim()
  }
  return name.trim()
}

export function getLocalizedPartnerLanguages(lang?: Language): PartnerLanguage[] {
  const activeLang: Language = lang === 'en' || lang === 'zh' ? lang : 'vi'
  const collatorLocale =
    activeLang === 'zh' ? 'zh-Hans-CN-u-co-pinyin' : activeLang === 'en' ? 'en' : 'vi'

  const autoEntry = SONIOX_LANGUAGE_DEFINITIONS[0]
  const popularEntries = SONIOX_LANGUAGE_DEFINITIONS.filter((d) => d.popular)
  const otherEntries = SONIOX_LANGUAGE_DEFINITIONS.filter(
    (d) => d.code !== 'any' && !d.popular
  )

  const toPartnerLang = (item: RawLanguageDefinition): PartnerLanguage => ({
    code: item.code,
    name: item.names[activeLang],
    shortName: item.shortName,
    flagCode: item.flagCode,
    popular: item.popular,
  })

  const sortedOthers = otherEntries
    .map(toPartnerLang)
    .sort((a, b) =>
      getSortKey(a.name, activeLang).localeCompare(
        getSortKey(b.name, activeLang),
        collatorLocale,
        { sensitivity: 'base' }
      )
    )

  return [
    toPartnerLang(autoEntry),
    ...popularEntries.map(toPartnerLang),
    ...sortedOthers,
  ]
}

export const PARTNER_LANGUAGES: PartnerLanguage[] = getLocalizedPartnerLanguages('vi')

export function getPartnerLanguage(
  code?: string | null,
  lang?: Language
): PartnerLanguage | undefined {
  if (!code || typeof code !== 'string') return undefined
  const cleanCode = code.trim().toLowerCase()
  if (cleanCode === 'vi') {
    const activeLang: Language = lang === 'en' || lang === 'zh' ? lang : 'vi'
    return {
      code: 'vi',
      name:
        activeLang === 'en'
          ? 'Vietnamese'
          : activeLang === 'zh'
            ? '越南语'
            : 'Việt',
      shortName: 'VI',
      flagCode: 'vn',
    }
  }
  const list = getLocalizedPartnerLanguages(lang)
  return list.find((language) => language.code.toLowerCase() === cleanCode)
}
