import assert from 'node:assert/strict'
import test from 'node:test'
import { translations, emailTranslations, detectMachineLanguage } from '../src/lib/i18n.ts'

test('all language dictionaries have 100% key parity', () => {
  const viKeys = Object.keys(translations.vi).sort()
  const enKeys = Object.keys(translations.en).sort()
  const zhKeys = Object.keys(translations.zh).sort()

  assert.deepEqual(enKeys, viKeys, 'English dictionary must match Vietnamese keys exactly')
  assert.deepEqual(zhKeys, viKeys, 'Chinese dictionary must match Vietnamese keys exactly')
})

test('no translation strings are empty or non-string', () => {
  const languages = ['vi', 'en', 'zh']
  for (const lang of languages) {
    for (const [key, value] of Object.entries(translations[lang])) {
      assert.equal(typeof value, 'string', `${lang}.${key} must be a string`)
      assert.ok(value.trim().length > 0, `${lang}.${key} must not be empty`)
    }
  }
})

test('placeholders match identically across all languages', () => {
  const placeholderRegex = /\{([a-zA-Z0-9_]+)\}/g
  const viKeys = Object.keys(translations.vi)

  for (const key of viKeys) {
    const viPlaceholders = [...translations.vi[key].matchAll(placeholderRegex)].map((m) => m[1]).sort()
    const enPlaceholders = [...translations.en[key].matchAll(placeholderRegex)].map((m) => m[1]).sort()
    const zhPlaceholders = [...translations.zh[key].matchAll(placeholderRegex)].map((m) => m[1]).sort()

    assert.deepEqual(
      enPlaceholders,
      viPlaceholders,
      `Placeholders for key "${key}" in English must match Vietnamese`
    )
    assert.deepEqual(
      zhPlaceholders,
      viPlaceholders,
      `Placeholders for key "${key}" in Chinese must match Vietnamese`
    )
  }
})

test('email templates have complete coverage and generate valid content', () => {
  const languages = ['vi', 'en', 'zh']
  for (const lang of languages) {
    const t = emailTranslations[lang]
    assert.ok(t, `emailTranslations[${lang}] must exist`)
    assert.equal(typeof t.subject, 'function')
    assert.equal(typeof t.greeting, 'function')
    assert.ok(t.subject('123456').includes('123456'))
    assert.ok(t.greeting('test@example.com').includes('test@example.com'))
    assert.ok(t.tagline.length > 0)
    assert.ok(t.otpTitle.length > 0)
    assert.ok(t.signInBtn.length > 0)
    assert.ok(t.expiryNotice.length > 0)
  }
})

test('detectMachineLanguage returns a valid supported language', () => {
  const lang = detectMachineLanguage()
  assert.ok(['vi', 'en', 'zh'].includes(lang))
})

test('useLanguage and useTheme hooks guard against SSR undefined window and normalize inputs', async () => {
  const fs = await import('node:fs/promises')
  const path = await import('node:path')
  const root = path.resolve(import.meta.dirname, '..')
  const langHook = await fs.readFile(path.join(root, 'src/hooks/useLanguage.ts'), 'utf8')
  const themeHook = await fs.readFile(path.join(root, 'src/hooks/useTheme.ts'), 'utf8')

  // SSR guards in subscription
  assert.match(langHook, /if \(typeof window === 'undefined'\) return \(\) => undefined/)
  assert.match(themeHook, /if \(typeof window === 'undefined'\) return \(\) => undefined/)

  // Input normalization in change callbacks
  assert.match(langHook, /validLang:\s*Language\s*=\s*newLang === 'vi' \|\| newLang === 'en' \|\| newLang === 'zh' \? newLang : 'vi'/)
  assert.match(themeHook, /validTheme:\s*ThemeType\s*=\s*newTheme === 'light' \? 'light' : 'dark'/)
})

test('getPartnerLanguage handles uppercase, whitespace, and null/undefined codes gracefully', async () => {
  const { getPartnerLanguage } = await import('../src/lib/languages.ts')
  assert.equal(getPartnerLanguage('en')?.code, 'en')
  assert.equal(getPartnerLanguage('EN')?.code, 'en')
  assert.equal(getPartnerLanguage('  zh  ')?.code, 'zh')
  assert.equal(getPartnerLanguage(null), undefined)
  assert.equal(getPartnerLanguage(undefined), undefined)
  assert.equal(getPartnerLanguage(''), undefined)
})

