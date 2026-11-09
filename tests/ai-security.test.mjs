import assert from 'node:assert/strict'
import test from 'node:test'
import {
  decryptAiKey,
  encryptAiKey,
  getAllowedAiHosts,
  getSafeAiEndpoint,
  mintSonioxWsTicket,
  redactSensitiveSecrets,
  verifySonioxWsTicket,
} from '../src/lib/ai-security.ts'
import {
  getFlagCountryCode,
  getLocalizedPartnerLanguages,
  PARTNER_LANGUAGES,
} from '../src/lib/languages.ts'

test('getSafeAiEndpoint defaults to OpenAI or 9r.9phut.org and strips trailing slash', () => {
  assert.equal(getSafeAiEndpoint(null), 'https://api.openai.com/v1')
  assert.equal(getSafeAiEndpoint('https://api.openai.com/v1/'), 'https://api.openai.com/v1')
  assert.equal(getSafeAiEndpoint('https://9r.9phut.org/v1/'), 'https://9r.9phut.org/v1')
})

test('getSafeAiEndpoint blocks SSRF vectors (http, credentials, custom ports, unknown hosts)', () => {
  assert.equal(getSafeAiEndpoint('http://api.openai.com/v1'), null)
  assert.equal(getSafeAiEndpoint('https://user:pass@api.openai.com/v1'), null)
  assert.equal(getSafeAiEndpoint('https://api.openai.com:8443/v1'), null)
  assert.equal(getSafeAiEndpoint('https://169.254.169.254/latest/meta-data'), null)
  assert.equal(getSafeAiEndpoint('not-a-url'), null)
})

test('getAllowedAiHosts and getSafeAiEndpoint respect AI_ALLOWED_HOSTS env', (t) => {
  const prev = process.env.AI_ALLOWED_HOSTS
  t.after(() => {
    if (prev === undefined) delete process.env.AI_ALLOWED_HOSTS
    else process.env.AI_ALLOWED_HOSTS = prev
  })

  process.env.AI_ALLOWED_HOSTS = ' API.GROQ.COM , openrouter.ai '
  assert.equal(getAllowedAiHosts().has('api.groq.com'), true)
  assert.equal(getSafeAiEndpoint('https://api.groq.com/openai/v1/'), 'https://api.groq.com/openai/v1')
})

test('encryptAiKey and decryptAiKey perform AES-256-GCM encryption at rest and redactSensitiveSecrets scrubs keys', async (t) => {
  const prevSecret = process.env.AI_KEY_ENCRYPTION_SECRET
  const prevAdminSecret = process.env.ADMIN_SESSION_SECRET
  t.after(() => {
    if (prevSecret === undefined) delete process.env.AI_KEY_ENCRYPTION_SECRET
    else process.env.AI_KEY_ENCRYPTION_SECRET = prevSecret
    if (prevAdminSecret === undefined) delete process.env.ADMIN_SESSION_SECRET
    else process.env.ADMIN_SESSION_SECRET = prevAdminSecret
  })

  delete process.env.AI_KEY_ENCRYPTION_SECRET
  delete process.env.ADMIN_SESSION_SECRET
  await assert.rejects(() => encryptAiKey('sk-should-fail-without-secret'))

  process.env.AI_KEY_ENCRYPTION_SECRET = 'unit-test-vault-secret-at-least-32-bytes'
  const plaintext = 'sk-test-1234567890abcdef-secret'
  const encrypted = await encryptAiKey(plaintext)
  assert.match(encrypted, /^enc:v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/)
  assert.notEqual(encrypted, plaintext)

  const decrypted = await decryptAiKey(encrypted)
  assert.equal(decrypted, plaintext)

  // Legacy plaintext fallback works seamlessly
  assert.equal(await decryptAiKey(plaintext), plaintext)

  // Redaction strips sk-*, snx_*, and Bearer tokens from error strings
  const leakedError = `Upstream error with Bearer ${plaintext} and key=${plaintext} and snx_proj_testSecretKey123456`
  const redacted = redactSensitiveSecrets(leakedError)
  assert.doesNotMatch(redacted, /sk-test-1234567890abcdef/)
  assert.doesNotMatch(redacted, /snx_proj_testSecretKey123456/)
  assert.match(redacted, /\[REDACTED_API_KEY\]/)
})

test('mintSonioxWsTicket and verifySonioxWsTicket sign and verify short-lived HMAC tickets without exposing master key', async () => {
  const masterKey = 'snx_proj_unit_test_secret_master_key_12345'
  const ticket = await mintSonioxWsTicket(masterKey, 'user-abc-123', 60)
  assert.match(ticket, /^paylingo_ws_v1\.\d+\.[0-9a-f]{24}\.user-abc-123\.[0-9a-f]{64}$/)
  assert.doesNotMatch(ticket, /snx_proj/)

  assert.equal(await verifySonioxWsTicket(ticket, masterKey), true)
  assert.equal(await verifySonioxWsTicket(ticket, 'wrong-master-key'), false)

  // Expired ticket is rejected
  const expiredTicket = await mintSonioxWsTicket(masterKey, 'user-abc-123', -10)
  assert.equal(await verifySonioxWsTicket(expiredTicket, masterKey), false)
})

test('Partner language catalog has 60 Soniox languages, orders Auto -> Popular -> A-Z per UI language, and maps valid flags', () => {
  assert.equal(PARTNER_LANGUAGES.length, 60)

  for (const uiLang of ['vi', 'en', 'zh']) {
    const list = getLocalizedPartnerLanguages(uiLang)
    assert.equal(list.length, 60)
    // First is always Auto Detect ('any')
    assert.equal(list[0].code, 'any')

    // Next 15 are popular languages
    const popularSlice = list.slice(1, 16)
    assert.equal(popularSlice.length, 15)
    for (const item of popularSlice) {
      assert.equal(item.popular, true)
    }

    // Remaining 44 languages are non-popular and sorted A-Z in the active UI language
    const othersSlice = list.slice(16)
    assert.equal(othersSlice.length, 44)
    for (const item of othersSlice) {
      assert.equal(Boolean(item.popular), false)
      assert.ok(item.name.length > 0)
      assert.ok(getFlagCountryCode(item.code).length >= 2)
    }

    const collatorLocale = uiLang === 'zh' ? 'zh-Hans-u-co-pinyin' : uiLang
    for (let i = 1; i < othersSlice.length; i++) {
      const cmp = othersSlice[i - 1].name.localeCompare(othersSlice[i].name, collatorLocale, { sensitivity: 'base' })
      assert.ok(cmp <= 0, `Expected ${othersSlice[i - 1].name} <= ${othersSlice[i].name} in ${uiLang}`)
    }
  }
})

