import assert from 'node:assert/strict'
import test from 'node:test'
import { generateSessionPrintHTML, safeFilename } from '../src/lib/pdf-generator.ts'
import { formatTimeline } from '../src/lib/utils.ts'

test('printable transcript escapes content and formats relative timestamps', () => {
  const html = generateSessionPrintHTML(
    '<img src=x onerror=alert(1)>',
    '" onload="alert(2)',
    '<script>alert(3)</script>',
    '2026-07-14T00:00:00.000Z',
    [{
      id: 'entry-1',
      session_id: 'session-1',
      speaker: 'host',
      original_text: '<svg onload=alert(4)>',
      translated_text: 'Xin chào',
      start_ms: 3_661_000,
      end_ms: 3_662_000,
      created_at: '2026-07-14T00:00:00.000Z',
      sync_status: 'synced',
      updated_at: '2026-07-14T00:00:00.000Z',
    }]
  )

  assert.doesNotMatch(html, /<script>alert/)
  assert.doesNotMatch(html, /<img src=x/)
  assert.doesNotMatch(html, /<svg onload/)
  assert.match(html, /lang="und"/)
  assert.match(html, /01:01:01/)
  assert.match(html, /&lt;svg onload=alert\(4\)&gt;/)
})

test('printable transcript handles invalid or NaN timestamps safely', () => {
  const html = generateSessionPrintHTML(
    'Session NaN',
    'en',
    'English',
    'invalid-date',
    [{
      id: 'entry-nan',
      session_id: 'session-nan',
      speaker: 'host',
      original_text: 'Hello',
      translated_text: 'Xin chào',
      start_ms: Number.NaN,
      end_ms: Number.NaN,
      created_at: 'invalid-date',
      sync_status: 'synced',
      updated_at: 'invalid-date',
    }]
  )

  assert.doesNotMatch(html, /NaN:NaN:NaN/)
  assert.match(html, /00:00:00/)
  assert.match(html, /Không rõ/)
})

test('formatTimeline handles negative, NaN, and normal durations cleanly', () => {
  assert.equal(formatTimeline(0), '00:00')
  assert.equal(formatTimeline(-5000), '00:00')
  assert.equal(formatTimeline(Number.NaN), '00:00')
  assert.equal(formatTimeline(65_000), '01:05')
  assert.equal(formatTimeline(3_665_000), '01:01:05')
})

test('safeFilename strips control characters, path separators, dot prefixes, and bounds length', () => {
  assert.equal(safeFilename(null), 'hoi-thoai')
  assert.equal(safeFilename(''), 'hoi-thoai')
  assert.equal(safeFilename('../../../etc/passwd'), 'etc-passwd')
  assert.equal(safeFilename('Hội thoại: Bạn & Tôi / 2026?'), 'Hội_thoại-_Bạn_&_Tôi_-_2026')
  assert.equal(safeFilename('\x00\x1f\x7fcontrol\x00'), 'control')

  const veryLong = 'a'.repeat(200)
  const result = safeFilename(veryLong)
  assert.equal(result.length, 64)
})

