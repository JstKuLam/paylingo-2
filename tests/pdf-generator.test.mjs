import assert from 'node:assert/strict'
import test from 'node:test'
import { generateSessionPrintHTML } from '../src/lib/pdf-generator.ts'

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
