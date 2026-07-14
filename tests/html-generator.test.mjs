import assert from 'node:assert/strict'
import test from 'node:test'
import { generatePremiumHTMLReport } from '../src/lib/html-generator.ts'

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
