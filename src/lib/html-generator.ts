/**
 * Premium HTML Report Generator for PayLingo AI Summaries
 * Outputs an industry-standard, fully responsive, and stunning HTML report.
 */

interface HTMLReportProps {
  sessionName: string;
  partnerLang?: string;
  startedAt?: string;
  markdown: string;
  generatedAt?: string;
}

/**
 * Extracts a key section from the Markdown text based on standard keywords.
 */
function extractSection(markdown: string, keywords: string): string {
  const lines = markdown.split('\n')
  const sectionContent: string[] = []
  let found = false
  
  const regex = new RegExp(`(?:#+|\\*\\*)\\s*(?:\\d+\\.)?\\s*(?:${keywords})`, 'i')
  const nextHeaderRegex = /^(?:#+|\*\*)/
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (regex.test(line)) {
      found = true
      continue
    }
    
    if (found) {
      // If we encounter a new main heading, we stop
      if (nextHeaderRegex.test(line) && line.replace(/^\*+|\*+$/g, '').trim().length > 3) {
        const isNewMainSection = /Text sạch|Clean Text|Nhận diện|Speaker|Tóm tắt điều hành|Executive|Hành động|Action|Quyết định|Decisions|Rủi ro|Risks|Sơ đồ tư duy|Mind Map/i.test(line)
        if (isNewMainSection) {
          break
        }
      }
      sectionContent.push(lines[i])
    }
  }
  
  return found ? sectionContent.join('\n').trim() : ''
}

function escapeHtml(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Fallback to split sections if standard extraction fails.
 */
function extractFallback(markdown: string, partIndex: number): string {
  const parts = markdown.split(/(?:#+|\*\*)\s*(?=\d+\.|\b[A-ZĐNTRQST])/i)
  for (const part of parts) {
    const trimmed = part.trim()
    const firstLine = trimmed.split('\n')[0] || ''
    if (new RegExp(`^\\s*${partIndex}\\.`, 'i').test(firstLine)) {
      const lines = trimmed.split('\n')
      lines.shift()
      return lines.join('\n').trim()
    }
  }
  return ''
}

/**
 * Converts markdown text block into clean and styled HTML.
 */
function mdToHtml(md: string): string {
  if (!md) return ''
  
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Headers inside section
    .replace(/### (.*)/g, '<h4 class="sub-header">$1</h4>')
    .replace(/## (.*)/g, '<h4 class="sub-header">$1</h4>')
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Checkboxes (unchecked)
    .replace(/^\s*-\s+\[\s*\]\s+(.*)$/gm, '<div class="checkbox-item"><span class="checkbox-box"></span><span class="checkbox-label">$1</span></div>')
    // Checkboxes (checked)
    .replace(/^\s*-\s+\[[xX]\]\s+(.*)$/gm, '<div class="checkbox-item checkbox-checked"><span class="checkbox-box">✓</span><span class="checkbox-label">$1</span></div>')
    // Standard list items
    .replace(/^\s*-\s+(.*)$/gm, '<li>$1</li>')
    // Standard numbered items
    .replace(/^\s*\d+\.\s+(.*)$/gm, '<li>$1</li>')

  // Group list items into <ul> blocks
  html = html.replace(/(<li>.*<\/li>)/g, '<ul>$1</ul>')
  html = html.replace(/<\/ul>\s*<ul>/g, '')

  // Paragraph processing
  const lines = html.split('\n')
  const processedLines = lines.map(line => {
    const trimmed = line.trim()
    if (trimmed.startsWith('<li') || trimmed.startsWith('<ul') || trimmed.startsWith('<div') || trimmed.startsWith('<h4') || trimmed.startsWith('</ul')) {
      return line
    }
    if (trimmed === '') return ''
    return `<p class="paragraph">${line}</p>`
  })

  return processedLines.join('\n')
}

function cleanMindMap(raw: string): string {
  if (!raw) return ''
  return raw
    .trim()
    .replace(/^```[a-z0-9_-]*\r?\n?/i, '')
    .replace(/\r?\n?```$/i, '')
    .trim()
}

export function generatePremiumHTMLReport({
  sessionName,
  partnerLang = 'English',
  startedAt,
  markdown,
  generatedAt = new Date().toLocaleString('vi-VN')
}: HTMLReportProps): string {
  
  // 1. Parse standard sections
  const cleanText = extractSection(markdown, 'Text sạch|Clean Text') || extractFallback(markdown, 1)
  const speakerId = extractSection(markdown, 'Nhận diện người nói|Speaker Identification|Speaker ID') || extractFallback(markdown, 2)
  const execSummary = extractSection(markdown, 'Tóm tắt điều hành|Executive Summary') || extractFallback(markdown, 3)
  const actionItems = extractSection(markdown, 'Hành động kế tiếp|Action Items') || extractFallback(markdown, 4)
  const decisions = extractSection(markdown, 'Quyết định|Decisions') || extractFallback(markdown, 5)
  const risks = extractSection(markdown, 'Rủi ro|Risks') || extractFallback(markdown, 6)
  const rawMindMap = extractSection(markdown, 'Sơ đồ tư duy|Mind Map') || extractFallback(markdown, 7)
  const mindMap = cleanMindMap(rawMindMap)

  const cleanTextHtml = mdToHtml(cleanText)
  const speakerIdHtml = mdToHtml(speakerId)
  const execSummaryHtml = mdToHtml(execSummary)
  const actionItemsHtml = mdToHtml(actionItems)
  const decisionsHtml = mdToHtml(decisions)
  const risksHtml = mdToHtml(risks)

  // Mind map format (protecting tree lines)
  const mindMapHtml = mindMap
    ? `<pre class="mindmap-code">${escapeHtml(mindMap)}</pre>`
    : `<div class="empty-state">Không có dữ liệu sơ đồ tư duy cuộc họp.</div>`

  // Title display
  const safeSessionName = typeof sessionName === 'string' && sessionName.trim() ? sessionName.trim() : 'Tóm tắt Hội thoại PayLingo'
  const displayTitle = escapeHtml(safeSessionName)
  const displayGeneratedAt = escapeHtml(generatedAt)
  const displayPartnerLang = escapeHtml(partnerLang)

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Báo cáo Tóm tắt Cuộc họp AI - ${displayTitle}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    /* Styling System inspired by Apple HIG & shadcn UI */
    :root {
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --border: #e2e8f0;
      --text: #0f172a;
      --text-muted: #64748b;
      
      --accent-blue: #2563eb;
      --accent-blue-bg: #eff6ff;
      --accent-blue-border: #bfdbfe;
      
      --accent-green: #059669;
      --accent-green-bg: #ecfdf5;
      --accent-green-border: #a7f3d0;
      
      --accent-amber: #d97706;
      --accent-amber-bg: #fef3c7;
      --accent-amber-border: #fde68a;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Outfit', 'Inter', -apple-system, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 32px 16px;
      font-size: 14px;
    }

    .container {
      max-width: 820px;
      margin: 0 auto;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 40px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
    }

    /* Header Styling */
    .header {
      border-bottom: 2px solid #f1f5f9;
      padding-bottom: 24px;
      margin-bottom: 32px;
    }

    .badge {
      display: inline-block;
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: var(--accent-blue);
      background: var(--accent-blue-bg);
      padding: 6px 12px;
      border-radius: 9999px;
      margin-bottom: 12px;
      border: 1px solid var(--accent-blue-border);
    }

    .report-title {
      font-size: 26px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.5px;
      line-height: 1.25;
      margin-bottom: 12px;
    }

    .meta-grid {
      display: grid;
      grid-template-cols: 1fr 1fr;
      gap: 12px 24px;
      margin-top: 18px;
    }

    .meta-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .meta-label {
      font-size: 10px;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.8px;
    }

    .meta-value {
      font-size: 12.5px;
      font-weight: 600;
      color: #334155;
    }

    /* Sections / Card Layout */
    .section-card {
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 24px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.01);
    }

    .section-card.highlight {
      background: var(--accent-blue-bg);
      border-color: var(--accent-blue-border);
    }

    .section-card.warning {
      background: var(--accent-amber-bg);
      border-color: var(--accent-amber-border);
    }

    .section-title {
      font-size: 15px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .section-card.highlight .section-title {
      color: var(--accent-blue);
    }

    .section-card.warning .section-title {
      color: var(--accent-amber);
    }

    /* Two-column layout */
    .grid-2col {
      display: grid;
      grid-template-cols: 1fr 1fr;
      gap: 24px;
      margin-bottom: 24px;
    }

    @media (max-width: 640px) {
      .grid-2col {
        grid-template-cols: 1fr;
        gap: 16px;
      }
      .meta-grid {
        grid-template-cols: 1fr;
      }
      .container {
        padding: 24px;
      }
    }

    /* Paragraph & Typography inside cards */
    .paragraph {
      margin-bottom: 12px;
      color: #334155;
      font-size: 13.5px;
      line-height: 1.6;
    }
    
    .paragraph:last-child {
      margin-bottom: 0;
    }

    .sub-header {
      font-size: 13px;
      font-weight: 700;
      margin-top: 18px;
      margin-bottom: 8px;
      color: #0f172a;
    }

    /* Lists styling */
    ul {
      list-style-type: none;
      padding-left: 0;
      margin-bottom: 12px;
    }

    ul li {
      position: relative;
      padding-left: 20px;
      margin-bottom: 8px;
      color: #334155;
      font-size: 13px;
    }

    ul li::before {
      content: "•";
      position: absolute;
      left: 6px;
      top: 0;
      color: var(--accent-blue);
      font-weight: 900;
      font-size: 16px;
      line-height: 1;
    }

    /* Checklist & Checkbox Items */
    .checkbox-item {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin-bottom: 10px;
      font-size: 13px;
      color: #334155;
    }

    .checkbox-box {
      width: 16px;
      height: 16px;
      border: 1.5px solid #cbd5e1;
      border-radius: 4px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: bold;
      color: transparent;
      margin-top: 2px;
      flex-shrink: 0;
      background: #ffffff;
    }

    .checkbox-checked .checkbox-box {
      background: var(--accent-green);
      border-color: var(--accent-green);
      color: #ffffff;
    }

    .checkbox-checked .checkbox-label {
      text-decoration: line-through;
      color: #94a3b8;
    }

    /* Decisions List styling */
    .decisions-list ul li::before {
      content: "✓";
      color: var(--accent-green);
      font-size: 12px;
      left: 4px;
      top: 1px;
    }

    /* Mind Map Pre-formatted block */
    .mindmap-code {
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      background: #0f172a;
      color: #38bdf8;
      padding: 20px;
      border-radius: 12px;
      overflow-x: auto;
      line-height: 1.55;
      font-size: 11.5px;
      border: 1px solid #1e293b;
      letter-spacing: -0.2px;
    }

    .empty-state {
      font-style: italic;
      color: var(--text-muted);
      text-align: center;
      padding: 12px 0;
    }

    /* Print styling rules */
    @media print {
      body {
        background: #ffffff;
        padding: 0;
      }
      .container {
        border: none;
        box-shadow: none;
        padding: 0;
        max-width: 100%;
      }
      .section-card {
        break-inside: avoid;
        page-break-inside: avoid;
        border: 1px solid #cbd5e1;
      }
      .mindmap-code {
        white-space: pre-wrap;
        word-break: break-all;
        background: #f8fafc;
        color: #0f172a;
        border: 1px solid #cbd5e1;
      }
    }
  </style>
</head>
<body>

  <div class="container">
    
    <!-- Report Header -->
    <header class="header">
      <span class="badge">Báo Cáo AI Tự Động</span>
      <h1 class="report-title">Tóm tắt Cuộc họp Đa ngôn ngữ</h1>
      
      <div class="meta-grid">
        <div class="meta-item">
          <span class="meta-label">Tên cuộc hội thoại</span>
          <span class="meta-value">${displayTitle}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Ngày khởi tạo tóm tắt</span>
          <span class="meta-value">${displayGeneratedAt}</span>
        </div>
        ${startedAt && Number.isFinite(new Date(startedAt).getTime()) ? `
        <div class="meta-item">
          <span class="meta-label">Thời điểm ghi âm</span>
          <span class="meta-value">${escapeHtml(new Date(startedAt).toLocaleString('vi-VN'))}</span>
        </div>
        ` : ''}
        <div class="meta-item">
          <span class="meta-label">Ngôn ngữ đàm thoại</span>
          <span class="meta-value">Tiếng Việt • Đối tác (${displayPartnerLang})</span>
        </div>
      </div>
    </header>

    <!-- 1. Executive Summary (Highlight Card) -->
    ${execSummaryHtml ? `
    <section class="section-card highlight">
      <h2 class="section-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-top: -1px;"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
        Tóm tắt Điều hành (Executive Summary)
      </h2>
      <div class="section-body">
        ${execSummaryHtml}
      </div>
    </section>
    ` : ''}

    <!-- 2. Clean Text Section -->
    ${cleanTextHtml ? `
    <section class="section-card">
      <h2 class="section-title" style="color: var(--accent-blue);">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-top: -1px;"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>
        Văn bản Cuộc họp sạch (Clean Text)
      </h2>
      <div class="section-body" style="font-size: 13.5px; line-height: 1.75; color: #1e293b;">
        ${cleanTextHtml}
      </div>
    </section>
    ` : ''}

    <!-- 3. Speaker ID & Decisions Grid -->
    <div class="grid-2col">
      <!-- Speaker Identification -->
      <section class="section-card">
        <h2 class="section-title" style="color: #475569;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-top: -1px;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          Nhận diện Người nói (Speaker Goals)
        </h2>
        <div class="section-body">
          ${speakerIdHtml || '<div class="empty-state">Không có thông tin người nói.</div>'}
        </div>
      </section>

      <!-- Key Decisions -->
      <section class="section-card decisions-list">
        <h2 class="section-title" style="color: var(--accent-green);">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-top: -1px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
          Quyết định Thống nhất (Decisions)
        </h2>
        <div class="section-body">
          ${decisionsHtml || '<div class="empty-state">Không có quyết định quan trọng nào được lưu lại.</div>'}
        </div>
      </section>
    </div>

    <!-- 4. Action Items Checklist -->
    ${actionItemsHtml ? `
    <section class="section-card">
      <h2 class="section-title" style="color: var(--accent-green);">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-top: -1px;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="9" x2="15" y2="9"></line><line x1="9" y1="13" x2="15" y2="13"></line><line x1="9" y1="17" x2="15" y2="17"></line><line x1="5" y1="9" x2="5.01" y2="9"></line><line x1="5" y1="13" x2="5.01" y2="13"></line><line x1="5" y1="17" x2="5.01" y2="17"></line></svg>
        Hành động Kế tiếp (Action Items)
      </h2>
      <div class="section-body">
        ${actionItemsHtml}
      </div>
    </section>
    ` : ''}

    <!-- 5. Risks & Warnings -->
    ${risksHtml && risksHtml.trim().length > 10 ? `
    <section class="section-card warning">
      <h2 class="section-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-top: -1px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
        Rủi ro & Lưu ý (Risks)
      </h2>
      <div class="section-body">
        ${risksHtml}
      </div>
    </section>
    ` : ''}

    <!-- 6. Meeting Mind Map -->
    <section class="section-card" style="margin-bottom: 0;">
      <h2 class="section-title" style="color: #0284c7;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-top: -1px;"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
        Sơ đồ Tư duy cuộc họp (Meeting Mind Map)
      </h2>
      <div class="section-body">
        ${mindMapHtml}
      </div>
    </section>

  </div>

</body>
</html>`;
}

export function safeHtmlFilename(sessionName: string | null | undefined): string {
  const safeName = typeof sessionName === 'string' ? sessionName : ''
  const dateStr = new Date().toISOString().slice(0, 10)
  const cleanName = safeName
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove tone marks
    .replace(/[\x00-\x1f\x7f\\/:*?"<>|]+/g, '_')
    .replace(/[^a-z0-9]+/g, '_')
    .slice(0, 64)
    .replace(/^_+|_+$/g, '')
  return `tom_tat_${cleanName || 'cuoc_hop'}_${dateStr}.html`
}

/**
 * Initiates browser download of the beautiful HTML summary report file.
 */
export function downloadSummaryHTML(sessionName: string, markdown: string, startedAt?: string, partnerLang?: string) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  const htmlContent = generatePremiumHTMLReport({
    sessionName,
    markdown,
    startedAt,
    partnerLang
  });
  
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', safeHtmlFilename(sessionName));
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
