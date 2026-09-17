import type { LocalTranscriptEntry } from './db'

function escapeHtml(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export function safeFilename(value: string | null | undefined): string {
  if (!value || typeof value !== 'string') return 'hoi-thoai'
  const sanitized = value
    .trim()
    .replace(/[\x00-\x1f\x7f\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '_')
    .slice(0, 64)
    .replace(/^[-_.]+|[-_.]+$/g, '')
  return sanitized || 'hoi-thoai'
}

function formatOffset(milliseconds: number) {
  const safeMs = Number.isFinite(milliseconds) ? Math.max(0, milliseconds) : 0
  const totalSeconds = Math.floor(safeMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':')
}

export function generateSessionPrintHTML(
  sessionName: string,
  partnerLang: string,
  partnerLangName: string,
  startedAt: string,
  entries: LocalTranscriptEntry[]
) {
  const safeSessionName = typeof sessionName === 'string' && sessionName.trim() ? sessionName.trim() : 'Hội thoại PayLingo'
  const safeEntries = Array.isArray(entries) ? entries : []
  const safeLanguage = /^[a-z]{2,3}(?:-[a-z0-9]+)*$/i.test(partnerLang) ? partnerLang : 'und'
  const safePartnerLangName = partnerLangName || 'Đối tác'

  const rows = safeEntries.map((entry) => {
    const hostText = entry.speaker === 'host' ? (entry.original_text || '') : (entry.translated_text || '')
    const partnerText = entry.speaker === 'partner' ? (entry.original_text || '') : (entry.translated_text || '')
    const hostLabel = entry.speaker === 'host' ? 'Bạn' : `${safePartnerLangName} (dịch)`
    const partnerLabel = entry.speaker === 'partner' ? safePartnerLangName : 'Bạn (dịch)'

    return `
      <tr>
        <td>
          <p class="speaker">${escapeHtml(hostLabel)}</p>
          <p>${escapeHtml(hostText)}</p>
          <time>${formatOffset(entry.start_ms)}</time>
        </td>
        <td lang="${safeLanguage}">
          <p class="speaker">${escapeHtml(partnerLabel)}</p>
          <p>${escapeHtml(partnerText)}</p>
          <time>${formatOffset(entry.start_ms)}</time>
        </td>
      </tr>`
  }).join('')

  return `<!doctype html>
    <html lang="vi">
      <head>
        <meta charset="utf-8">
        <title>${escapeHtml(safeSessionName)} - PayLingo</title>
        <style>
          @page { size: A4; margin: 16mm; }
          * { box-sizing: border-box; }
          body { margin: 0; color: #172033; font: 11pt/1.5 Arial, "Noto Sans", sans-serif; }
          header { border-bottom: 2px solid #172033; margin-bottom: 18px; padding-bottom: 12px; }
          h1 { font-size: 20pt; line-height: 1.2; margin: 0 0 6px; overflow-wrap: anywhere; }
          header p { color: #586174; font-size: 9pt; margin: 0; }
          table { border-collapse: collapse; table-layout: fixed; width: 100%; }
          th { background: #eef3f8; color: #344054; font-size: 9pt; padding: 8px; text-align: left; }
          td { border-bottom: 1px solid #dfe5ec; padding: 10px 8px; vertical-align: top; width: 50%; }
          tr { break-inside: avoid; }
          td p { margin: 0; overflow-wrap: anywhere; white-space: pre-wrap; }
          .speaker { color: #526071; font-size: 8pt; font-weight: 700; margin-bottom: 4px; text-transform: uppercase; }
          time { color: #748094; display: block; font-size: 8pt; margin-top: 6px; }
          footer { color: #748094; font-size: 8pt; margin-top: 18px; text-align: center; }
        </style>
      </head>
      <body>
        <header>
          <h1>${escapeHtml(sessionName)}</h1>
          <p>Bắt đầu: ${escapeHtml(Number.isFinite(new Date(startedAt).getTime()) ? new Date(startedAt).toLocaleString('vi-VN') : 'Không rõ')} · Ngôn ngữ đối tác: ${escapeHtml(partnerLangName)}</p>
        </header>
        <table>
          <thead><tr><th>Bạn · Tiếng Việt</th><th lang="${safeLanguage}">Đối tác · ${escapeHtml(partnerLangName)}</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <footer>PayLingo · Bản ghi hội thoại song ngữ</footer>
      </body>
    </html>`
}

/**
 * Open the browser's native print dialog with an A4 report. This keeps the
 * PDF renderer out of the Edge bundle while preserving multilingual fonts.
 */
export async function downloadSessionPDF(
  sessionName: string,
  partnerLang: string,
  partnerLangName: string,
  startedAt: string,
  entries: LocalTranscriptEntry[]
) {
  const html = generateSessionPrintHTML(sessionName, partnerLang, partnerLangName, startedAt, entries)

  const blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
  const frame = document.createElement('iframe')
  frame.title = `Xuất PDF ${sessionName}`
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none'
  frame.src = blobUrl
  document.body.appendChild(frame)

  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      frame.remove()
      URL.revokeObjectURL(blobUrl)
    }
    const timeout = window.setTimeout(cleanup, 60_000)

    frame.onload = () => {
      const printWindow = frame.contentWindow
      if (!printWindow) {
        window.clearTimeout(timeout)
        cleanup()
        reject(new Error('Không thể mở trình in PDF'))
        return
      }

      printWindow.addEventListener('afterprint', () => {
        window.clearTimeout(timeout)
        cleanup()
      }, { once: true })
      printWindow.focus()
      printWindow.print()
      resolve()
    }
    frame.onerror = () => {
      window.clearTimeout(timeout)
      cleanup()
      reject(new Error('Không thể tạo tài liệu PDF'))
    }
  })
}

export async function downloadSessionTXT(
  sessionName: string,
  partnerLangName: string,
  startedAt: string,
  entries: LocalTranscriptEntry[]
) {
  const formattedDate = Number.isFinite(new Date(startedAt).getTime())
    ? new Date(startedAt).toLocaleString('vi-VN')
    : 'Không rõ'
  const safeSessionName = typeof sessionName === 'string' && sessionName.trim() ? sessionName.trim() : 'Hội thoại PayLingo'
  const safePartnerLangName = partnerLangName || 'Đối tác'
  const safeEntries = Array.isArray(entries) ? entries : []

  let txtContent = '==================================================\n'
  txtContent += `HỘI THOẠI: ${safeSessionName}\n`
  txtContent += `Thời gian bắt đầu: ${formattedDate}\n`
  txtContent += `Ngôn ngữ đối tác: ${safePartnerLangName}\n`
  txtContent += '==================================================\n\n'

  safeEntries.forEach((entry) => {
    const speaker = entry.speaker === 'host' ? 'BẠN' : safePartnerLangName.toUpperCase()
    txtContent += `[${formatOffset(entry.start_ms)}] ${speaker}:\n`
    txtContent += `- Gốc: ${entry.original_text || ''}\n`
    txtContent += `- Dịch: ${entry.translated_text || ''}\n`
    txtContent += '--------------------------------------------------\n'
  })

  const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${safeFilename(safeSessionName)}.txt`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export async function downloadSessionJSON(
  sessionName: string,
  partnerLang: string,
  partnerLangName: string,
  startedAt: string,
  entries: LocalTranscriptEntry[]
) {
  const safeSessionName = typeof sessionName === 'string' && sessionName.trim() ? sessionName.trim() : 'Hội thoại PayLingo'
  const safePartnerLang = partnerLang || 'und'
  const safePartnerLangName = partnerLangName || 'Đối tác'
  const safeEntries = Array.isArray(entries) ? entries : []

  const exportData = {
    appName: 'PayLingo',
    sessionName: safeSessionName,
    partnerLang: safePartnerLang,
    partnerLangName: safePartnerLangName,
    startedAt,
    exportedAt: new Date().toISOString(),
    entriesCount: safeEntries.length,
    entries: safeEntries.map((entry) => ({
      id: entry.id,
      speaker: entry.speaker,
      original_text: entry.original_text || '',
      translated_text: entry.translated_text || '',
      start_ms: Number.isFinite(entry.start_ms) ? Math.max(0, entry.start_ms) : 0,
      end_ms: Number.isFinite(entry.end_ms) ? Math.max(0, entry.end_ms) : 0,
      created_at: entry.created_at || '',
    })),
  }

  const jsonString = JSON.stringify(exportData, null, 2)
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${safeFilename(safeSessionName)}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
