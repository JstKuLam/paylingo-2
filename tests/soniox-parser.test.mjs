import assert from 'node:assert/strict'
import test from 'node:test'
import {
  RFC4122_NAMESPACE_VECTOR,
  encodeStreamBidiMarker,
  parseTokensToMessages,
  stringToUUID,
} from '../src/lib/soniox-parser.ts'

test('stringToUUID is deterministic, namespaced, and UUID v5 shaped', () => {
  const first = stringToUUID('session-a:msg-host-1000')
  const repeated = stringToUUID('session-a:msg-host-1000')
  const anotherSession = stringToUUID('session-b:msg-host-1000')

  assert.equal(first, repeated)
  assert.notEqual(first, anotherSession)
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.equal(RFC4122_NAMESPACE_VECTOR.length, 16)
  assert.equal(encodeStreamBidiMarker().length, 128)
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

test('parseTokensToMessages preserves chronological order when timestamps reset to 0 after WebSocket reconnect', () => {
  const messages = parseTokensToMessages([
    // First WebSocket session up to 6 minutes (360,000 ms)
    { text: 'Câu trước khi rớt mạng', language: 'vi', translation_status: 'original', start_ms: 358000, end_ms: 360000, is_final: true },
    // Second WebSocket session after auto_reconnect (start_ms resets to 0)
    { text: 'Câu mới sau khi kết nối lại.', language: 'vi', translation_status: 'original', start_ms: 200, end_ms: 1200, is_final: true },
  ], [])

  assert.equal(messages.length, 2)
  assert.equal(messages[0].original_text, 'Câu trước khi rớt mạng')
  assert.equal(messages[1].original_text, 'Câu mới sau khi kết nối lại.')
  assert.ok(messages[1].start_ms > messages[0].end_ms)
  assert.notEqual(messages[0].id, messages[1].id)
})

test('parseTokensToMessages ignores <end> endpoint tokens and preserves Vietnamese BPE subwords like mừng', () => {
  const messages = parseTokensToMessages([
    { text: 'Hello.', language: 'en', translation_status: 'original', start_ms: 100, end_ms: 500, is_final: true },
    { text: 'Chào', source_language: 'en', translation_status: 'translation', is_final: true },
    { text: ' m', source_language: 'en', translation_status: 'translation', is_final: true },
    { text: 'ừ', source_language: 'en', translation_status: 'translation', is_final: true },
    { text: 'ng.', source_language: 'en', translation_status: 'translation', is_final: true },
    { text: '<end>', language: 'en', translation_status: 'original', start_ms: 500, end_ms: 500, is_final: true },
  ], [])

  assert.equal(messages.length, 1)
  assert.equal(messages[0].original_text, 'Hello.')
  assert.equal(messages[0].translated_text, 'Chào mừng.')
})

test('parseTokensToMessages splits turns on Soniox v6 speaker diarization changes', () => {
  const messages = parseTokensToMessages([
    { text: 'Báo cáo doanh thu quý 3', language: 'vi', speaker: '1', translation_status: 'original', start_ms: 100, end_ms: 600, is_final: true },
    { text: ' đã hoàn tất', language: 'vi', speaker: '1', translation_status: 'original', start_ms: 620, end_ms: 1000, is_final: true },
    { text: 'Cảm ơn anh, tôi sẽ duyệt ngay', language: 'vi', speaker: '2', translation_status: 'original', start_ms: 1100, end_ms: 1600, is_final: true },
  ], [])

  assert.equal(messages.length, 2)
  assert.equal(messages[0].speaker_label, '1')
  assert.equal(messages[0].original_text, 'Báo cáo doanh thu quý 3 đã hoàn tất')
  assert.equal(messages[1].speaker_label, '2')
  assert.equal(messages[1].original_text, 'Cảm ơn anh, tôi sẽ duyệt ngay')
})

test('parseTokensToMessages generates distinct message IDs when consecutive turns share identical start_ms', () => {
  const messages = parseTokensToMessages([
    { text: 'Câu thứ nhất.', language: 'vi', speaker: '1', translation_status: 'original', start_ms: 0, end_ms: 0, is_final: true },
    { text: 'Câu thứ hai.', language: 'vi', speaker: '2', translation_status: 'original', start_ms: 0, end_ms: 0, is_final: true },
  ], [])

  assert.equal(messages.length, 2)
  assert.notEqual(messages[0].id, messages[1].id)
})

test('parseTokensToMessages preserves abbreviations like DC/KB/vs/NG and BPE subwords like medium', () => {
  const messages = parseTokensToMessages([
    { text: 'Washington DC vs New York, 500 KB file, medi', language: 'en', translation_status: 'original', start_ms: 100, end_ms: 400, is_final: true },
    { text: 'um size.', language: 'en', translation_status: 'original', start_ms: 410, end_ms: 700, is_final: true },
    { text: 'Lô hàng NG trong kho DC vs KB.', source_language: 'en', translation_status: 'translation', is_final: true },
  ], [])

  assert.equal(messages.length, 1)
  assert.equal(messages[0].original_text, 'Washington DC vs New York, 500 KB file, medium size.')
  assert.equal(messages[0].translated_text, 'Lô hàng NG trong kho DC vs KB.')
})

test('parseTokensToMessages splits interleaved turns chronologically and routes translations to earliest unpunctuated turn', () => {
  const messages = parseTokensToMessages([
    { text: 'Xin chào', language: 'vi', translation_status: 'original', start_ms: 100, end_ms: 400, is_final: true },
    { text: 'Hello there', language: 'en', translation_status: 'original', start_ms: 500, end_ms: 800, is_final: true },
    { text: 'Hôm nay thế nào?', language: 'vi', translation_status: 'original', start_ms: 900, end_ms: 1300, is_final: true },
    { text: 'Hello.', source_language: 'vi', translation_status: 'translation', is_final: true },
    { text: 'How is today?', source_language: 'vi', translation_status: 'translation', is_final: true },
  ], [])

  assert.equal(messages.length, 3)
  assert.deepEqual(messages.map((m) => m.speaker), ['host', 'partner', 'host'])
  assert.equal(messages[0].original_text, 'Xin chào')
  assert.equal(messages[0].translated_text, 'Hello.')
  assert.equal(messages[2].original_text, 'Hôm nay thế nào?')
  assert.equal(messages[2].translated_text, 'How is today?')
})

test('parseTokensToMessages keeps mid-sentence pause aligned with translation and runs in O(n) time for 800 turns', () => {
  const pauseMessages = parseTokensToMessages([
    { text: 'Chúng tôi muốn', language: 'vi', translation_status: 'original', start_ms: 0, end_ms: 800, is_final: true },
    { text: ' giảm giá 10%.', language: 'vi', translation_status: 'original', start_ms: 2800, end_ms: 3600, is_final: true },
    { text: 'We want a 10% discount.', source_language: 'vi', translation_status: 'translation', is_final: true },
    { text: 'Được không?', language: 'vi', translation_status: 'original', start_ms: 3900, end_ms: 4500, is_final: true },
    { text: 'Is that okay?', source_language: 'vi', translation_status: 'translation', is_final: true },
  ], [])

  assert.equal(pauseMessages.length, 2)
  assert.equal(pauseMessages[0].original_text, 'Chúng tôi muốn giảm giá 10%.')
  assert.equal(pauseMessages[0].translated_text, 'We want a 10% discount.')
  assert.equal(pauseMessages[1].original_text, 'Được không?')
  assert.equal(pauseMessages[1].translated_text, 'Is that okay?')

  const interruptedMessages = parseTokensToMessages([
    { text: 'Giá này thì', language: 'vi', translation_status: 'original', start_ms: 0, end_ms: 600, is_final: true },
    { text: 'Sorry?', language: 'en', translation_status: 'original', start_ms: 1000, end_ms: 1500, is_final: true },
    { text: ' hơi cao.', language: 'vi', translation_status: 'original', start_ms: 2000, end_ms: 2500, is_final: true },
    { text: 'This price is a bit high.', source_language: 'vi', translation_status: 'translation', is_final: true },
    { text: 'Được không?', language: 'vi', translation_status: 'original', start_ms: 4000, end_ms: 4500, is_final: true },
    { text: 'Is that okay?', source_language: 'vi', translation_status: 'translation', is_final: true },
  ], [])

  const hostTurns = interruptedMessages.filter((m) => m.speaker === 'host')
  assert.equal(hostTurns.length, 3)
  assert.equal(hostTurns[0].original_text, 'Giá này thì')
  assert.equal(hostTurns[0].translated_text, 'This price is a bit high.')
  assert.equal(hostTurns[1].original_text, 'hơi cao.')
  assert.equal(hostTurns[1].translated_text, '')
  assert.equal(hostTurns[2].original_text, 'Được không?')
  assert.equal(hostTurns[2].translated_text, 'Is that okay?')

  const interleavedChunkedTransMessages = parseTokensToMessages([
    { text: 'Xin chào bạn.', language: 'vi', translation_status: 'original', start_ms: 0, end_ms: 500, is_final: true },
    { text: 'Hôm', language: 'vi', translation_status: 'original', start_ms: 600, end_ms: 900, is_final: true },
    { text: 'Hello', source_language: 'vi', translation_status: 'translation', is_final: true },
    { text: ' nay thế nào?', language: 'vi', translation_status: 'original', start_ms: 950, end_ms: 1400, is_final: true },
    { text: ' friend.', source_language: 'vi', translation_status: 'translation', is_final: true },
    { text: 'How are you today?', source_language: 'vi', translation_status: 'translation', is_final: true },
  ], [])
  assert.equal(interleavedChunkedTransMessages.length, 2)
  assert.equal(interleavedChunkedTransMessages[0].original_text, 'Xin chào bạn.')
  assert.equal(interleavedChunkedTransMessages[0].translated_text, 'Hello friend.')
  assert.equal(interleavedChunkedTransMessages[1].original_text, 'Hôm nay thế nào?')
  assert.equal(interleavedChunkedTransMessages[1].translated_text, 'How are you today?')

  const bulkTokens = []
  for (let i = 0; i < 800; i++) {
    const start = i * 2000
    bulkTokens.push({
      text: `Câu thử nghiệm số ${i}.`,
      language: i % 2 === 0 ? 'vi' : 'en',
      translation_status: 'original',
      start_ms: start,
      end_ms: start + 800,
      is_final: true,
    })
    bulkTokens.push({
      text: `Translated sentence ${i}.`,
      source_language: i % 2 === 0 ? 'vi' : 'en',
      translation_status: 'translation',
      is_final: true,
    })
  }
  const t0 = performance.now()
  const bulkMessages = parseTokensToMessages(bulkTokens, [])
  const elapsedMs = performance.now() - t0
  assert.equal(bulkMessages.length, 800)
  assert.ok(elapsedMs < 25, `Expected O(n) parse of 800 turns in <25ms, got ${elapsedMs.toFixed(2)}ms`)
})

test('parseTokensToMessages breaks lines on <end> endpoint tokens and long continuous clauses without periods', () => {
  // 1. <end> endpoint token breaks unpunctuated utterances even with small (<1.5s) pause
  const endpointSplit = parseTokensToMessages([
    { text: 'Chúng ta bắt đầu buổi họp hôm nay nhé', language: 'vi', translation_status: 'original', start_ms: 100, end_ms: 1200, is_final: true },
    { text: "Let's start today's meeting", source_language: 'vi', translation_status: 'translation', is_final: true },
    { text: '<end>', language: 'vi', translation_status: 'original', start_ms: 1200, end_ms: 1200, is_final: true },
    { text: 'Đầu tiên là phần báo cáo tài chính quý 3', language: 'vi', translation_status: 'original', start_ms: 1500, end_ms: 2800, is_final: true },
    { text: 'First is the Q3 financial report', source_language: 'vi', translation_status: 'translation', is_final: true },
  ], [])
  assert.equal(endpointSplit.length, 2)
  assert.equal(endpointSplit[0].original_text, 'Chúng ta bắt đầu buổi họp hôm nay nhé')
  assert.equal(endpointSplit[0].translated_text, "Let's start today's meeting")
  assert.equal(endpointSplit[1].original_text, 'Đầu tiên là phần báo cáo tài chính quý 3')
  assert.equal(endpointSplit[1].translated_text, 'First is the Q3 financial report')

  // 2. Long continuous speech with only commas or no punctuation splits cleanly instead of creating a huge paragraph
  const longClauseTokens = [
    {
      text: 'Trong quý vừa qua chúng tôi đã hoàn thành việc tích hợp hệ thống thanh toán xuyên biên giới cho toàn bộ đối tác tại thị trường Đông Nam Á,',
      language: 'vi',
      translation_status: 'original',
      start_ms: 0,
      end_ms: 4000,
      is_final: true,
    },
    {
      text: ' đồng thời giảm thiểu chi phí vận hành xuống mức thấp nhất trong vòng ba năm trở lại đây',
      language: 'vi',
      translation_status: 'original',
      start_ms: 4100,
      end_ms: 7500,
      is_final: true,
    },
  ]
  const clauseSplit = parseTokensToMessages(longClauseTokens, [])
  assert.equal(clauseSplit.length, 2)
  assert.match(clauseSplit[0].original_text, /Đông Nam Á,$/)
  assert.match(clauseSplit[1].original_text, /^đồng thời giảm thiểu/)
})






