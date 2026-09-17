import assert from 'node:assert/strict'
import test from 'node:test'
import { generatePremiumHTMLReport, safeHtmlFilename } from '../src/lib/html-generator.ts'

test('HTML reports escape metadata and mind-map content', () => {
  const report = generatePremiumHTMLReport({
    sessionName: '<img src=x onerror=alert(1)>',
    partnerLang: '<script>alert(2)</script>',
    markdown: '## Sơ đồ tư duy\n└─ <script>alert(3)</script>',
  })

  assert.doesNotMatch(report, /<script>alert/)
  assert.doesNotMatch(report, /<img src=x/)
  assert.match(report, /&lt;script&gt;alert\(3\)&lt;\/script&gt;/)
  assert.match(report, /&lt;img src=x onerror=alert\(1\)&gt;/)
})

test('safeHtmlFilename handles null, special characters, tone marks, and bounds length', () => {
  assert.match(safeHtmlFilename(null), /^tom_tat_cuoc_hop_\d{4}-\d{2}-\d{2}\.html$/)
  assert.match(safeHtmlFilename(''), /^tom_tat_cuoc_hop_\d{4}-\d{2}-\d{2}\.html$/)
  assert.match(safeHtmlFilename('Cuộc họp Khách hàng Q3!'), /^tom_tat_cuoc_hop_khach_hang_q3_\d{4}-\d{2}-\d{2}\.html$/)
  assert.match(safeHtmlFilename('../../../etc/passwd'), /^tom_tat_etc_passwd_\d{4}-\d{2}-\d{2}\.html$/)

  const longTitle = 'a'.repeat(200)
  const result = safeHtmlFilename(longTitle)
  assert.ok(result.length < 100)
})

