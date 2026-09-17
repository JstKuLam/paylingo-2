import assert from 'node:assert/strict'
import test from 'node:test'
import { parseTokensToMessages, stringToUUID } from '../src/lib/soniox-parser.ts'

test('stringToUUID is deterministic, namespaced, and UUID v5 shaped', () => {
  const first = stringToUUID('session-a:msg-host-1000')
  const repeated = stringToUUID('session-a:msg-host-1000')
  const anotherSession = stringToUUID('session-b:msg-host-1000')

  assert.equal(first, repeated)
  assert.notEqual(first, anotherSession)
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
})

test('parseTokensToMessages routes originals and translations to the same speaker', () => {
  const messages = parseTokensToMessages([
    { text: 'Xin', language: 'vi', translation_status: 'original', start_ms: 0, end_ms: 200, is_final: true },
    { text: ' chao.', language: 'vi', translation_status: 'original', start_ms: 210, end_ms: 500, is_final: true },
    { text: 'Hello.', source_language: 'vi', translation_status: 'translation', is_final: true },
    { text: 'Hello.', language: 'en', translation_status: 'original', start_ms: 900, end_ms: 1200, is_final: true },
    { text: 'Xin chao.', source_language: 'en', translation_status: 'translation', is_final: true },
  ], [])

  assert.equal(messages.length, 2)
  assert.deepEqual(messages.map((message) => message.speaker), ['host', 'partner'])
  assert.equal(messages[0].original_text, 'Xin chao.')
  assert.equal(messages[0].translated_text, 'Hello.')
  assert.equal(messages[1].original_text, 'Hello.')
  assert.equal(messages[1].translated_text, 'Xin chao.')
})

test('parseTokensToMessages drops isolated filler tokens', () => {
  const messages = parseTokensToMessages([
    { text: 'um', language: 'en', translation_status: 'original', start_ms: 0, end_ms: 100, is_final: true },
    { text: 'Welcome.', language: 'en', translation_status: 'original', start_ms: 120, end_ms: 500, is_final: true },
  ], [])

  assert.equal(messages.length, 1)
  assert.equal(messages[0].original_text, 'Welcome.')
})

test('parseTokensToMessages sanitizes NaN/negative start_ms and handles early translation tokens cleanly', () => {
  // Case 1: Early translation token before any original token
  const earlyTranslation = parseTokensToMessages([
    { text: 'Hello there.', source_language: 'vi', translation_status: 'translation', is_final: true },
  ], [])

  assert.equal(earlyTranslation.length, 1)
  assert.equal(earlyTranslation[0].start_ms, 0)
  assert.ok(earlyTranslation[0].start_ms < 1000) // Must NOT be Date.now() timestamp!
  assert.equal(earlyTranslation[0].translated_text, 'Hello there.')

  // Case 2: NaN or negative start_ms/end_ms
  const invalidTimestamps = parseTokensToMessages([
    { text: 'Valid text.', language: 'en', translation_status: 'original', start_ms: Number.NaN, end_ms: -50, is_final: true },
  ], [])

  assert.equal(invalidTimestamps.length, 1)
  assert.equal(invalidTimestamps[0].start_ms, 0)
  assert.equal(invalidTimestamps[0].end_ms, 0)
})

