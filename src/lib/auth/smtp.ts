export interface SmtpEmailOptions {
  to: string
  subject: string
  html: string
}

interface SmtpConfig {
  host: string
  port: number
  user: string
  pass: string
  from: string
}

interface EdgeSocket {
  writable: { getWriter: () => WritableStreamDefaultWriter<Uint8Array> }
  readable: { getReader: () => ReadableStreamDefaultReader<Uint8Array> }
}

interface CfSocketsModule {
  connect: (address: { hostname: string; port: number }, options?: { secureTransport?: string }) => EdgeSocket
}

async function sendSmtpViaEdgeSocket(options: SmtpEmailOptions, config: SmtpConfig) {
  // @ts-expect-error cloudflare:sockets is dynamically provided at edge runtime
  const cfSockets = (await import(/* webpackIgnore: true */ 'cloudflare:sockets')) as CfSocketsModule
  
  const socket = cfSockets.connect(
    { hostname: config.host, port: config.port },
    { secureTransport: 'on' }
  )
  
  const writer = socket.writable.getWriter()
  const reader = socket.readable.getReader()
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  let buffer = ''

  async function readCompleteResponse(): Promise<{ code: number; text: string }> {
    let lastLine = ''
    while (true) {
      while (!buffer.includes('\r\n')) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        if (buffer.length > 64 * 1024) {
          throw new Error('SMTP buffer limit exceeded')
        }
      }
      
      const idx = buffer.indexOf('\r\n')
      if (idx === -1) {
        lastLine = buffer
        buffer = ''
        break
      }
      
      const line = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      lastLine = line
      
      if (/^\d{3} /.test(line)) {
        break
      }
    }
    
    const code = parseInt(lastLine.slice(0, 3), 10) || 0
    return { code, text: lastLine }
  }

  async function sendCmd(cmd: string): Promise<{ code: number; text: string }> {
    await writer.write(encoder.encode(cmd + '\r\n'))
    return await readCompleteResponse()
  }

  try {
    const greeting = await readCompleteResponse()
    if (greeting.code !== 220) {
      throw new Error(`SMTP Greeting failed (${greeting.code}): ${greeting.text}`)
    }

    const ehlo = await sendCmd('EHLO pay2pay.vn')
    if (ehlo.code !== 250) {
      throw new Error(`EHLO failed (${ehlo.code}): ${ehlo.text}`)
    }

    const auth = await sendCmd('AUTH LOGIN')
    if (auth.code !== 334) {
      throw new Error(`AUTH LOGIN failed (${auth.code}): ${auth.text}`)
    }

    const userRes = await sendCmd(btoa(config.user))
    if (userRes.code !== 334) {
      throw new Error(`SMTP Username failed (${userRes.code}): ${userRes.text}`)
    }

    const passRes = await sendCmd(btoa(config.pass))
    if (passRes.code !== 235) {
      throw new Error(`SMTP Authentication failed (${passRes.code}): ${passRes.text}`)
    }

    const mailFrom = await sendCmd(`MAIL FROM:<${config.user}>`)
    if (mailFrom.code !== 250) {
      throw new Error(`MAIL FROM failed (${mailFrom.code}): ${mailFrom.text}`)
    }

    const rcptTo = await sendCmd(`RCPT TO:<${options.to}>`)
    if (rcptTo.code !== 250) {
      throw new Error(`RCPT TO failed (${rcptTo.code}): ${rcptTo.text}`)
    }

    const data = await sendCmd('DATA')
    if (data.code !== 354) {
      throw new Error(`DATA command failed (${data.code}): ${data.text}`)
    }

    const message = [
      `From: ${config.from}`,
      `To: ${options.to}`,
      `Subject: ${options.subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      '',
      options.html,
      '.'
    ].join('\r\n')

    const dataRes = await sendCmd(message)
    if (dataRes.code !== 250) {
      throw new Error(`Message data submission failed (${dataRes.code}): ${dataRes.text}`)
    }

    await sendCmd('QUIT')
    return { success: true }
  } finally {
    try { writer.close().catch(() => {}) } catch {}
    try { reader.cancel().catch(() => {}) } catch {}
  }
}

function sendSmtpViaNodeTls(options: SmtpEmailOptions, config: SmtpConfig): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null
    try {
      const proc = (globalThis as unknown as { process?: { getBuiltinModule?: (name: string) => { connect: (port: number, host: string, cb: () => void) => { on: (event: string, handler: (data: Buffer) => void) => void; write: (data: string) => void; end: () => void; destroy?: () => void } } } }).process
      const tls = typeof proc?.getBuiltinModule === 'function' ? proc.getBuiltinModule('node:tls') : null
      if (!tls) {
        throw new Error('Node TLS module not accessible')
      }

      const socket = tls.connect(config.port, config.host, () => {})
      timer = setTimeout(() => {
        try { socket.destroy?.() } catch {}
        reject(new Error('SMTP connection timed out'))
      }, 15_000)

      let buffer = ''
      let state = 'INIT'

      socket.on('data', (chunk: Buffer) => {
        buffer += chunk.toString()
        while (buffer.includes('\r\n')) {
          const idx = buffer.indexOf('\r\n')
          const line = buffer.slice(0, idx)
          buffer = buffer.slice(idx + 2)

          if (!/^\d{3} /.test(line)) continue

          if (line.startsWith('220 ') && state === 'INIT') {
            state = 'EHLO'
            socket.write('EHLO pay2pay.vn\r\n')
          } else if (line.startsWith('250 ') && state === 'EHLO') {
            state = 'AUTH'
            socket.write('AUTH LOGIN\r\n')
          } else if (line.startsWith('334 ') && state === 'AUTH') {
            state = 'USER'
            socket.write(Buffer.from(config.user).toString('base64') + '\r\n')
          } else if (line.startsWith('334 ') && state === 'USER') {
            state = 'PASS'
            socket.write(Buffer.from(config.pass).toString('base64') + '\r\n')
          } else if (line.startsWith('235 ') && state === 'PASS') {
            state = 'MAIL_FROM'
            socket.write(`MAIL FROM:<${config.user}>\r\n`)
          } else if (line.startsWith('250 ') && state === 'MAIL_FROM') {
            state = 'RCPT_TO'
            socket.write(`RCPT TO:<${options.to}>\r\n`)
          } else if (line.startsWith('250 ') && state === 'RCPT_TO') {
            state = 'DATA'
            socket.write('DATA\r\n')
          } else if (line.startsWith('354 ') && state === 'DATA') {
            state = 'BODY'
            const msg = [
              `From: ${config.from}`,
              `To: ${options.to}`,
              `Subject: ${options.subject}`,
              'MIME-Version: 1.0',
              'Content-Type: text/html; charset=utf-8',
              '',
              options.html,
              '.'
            ].join('\r\n') + '\r\n'
            socket.write(msg)
          } else if (line.startsWith('250 ') && state === 'BODY') {
            if (timer) clearTimeout(timer)
            socket.write('QUIT\r\n')
            socket.end()
            resolve({ success: true })
          } else if (line.startsWith('4') || line.startsWith('5')) {
            if (timer) clearTimeout(timer)
            reject(new Error(`SMTP Error: ${line}`))
          }
        }
      })

      socket.on('error', (err: unknown) => {
        if (timer) clearTimeout(timer)
        reject(err instanceof Error ? err : new Error(String(err)))
      })
    } catch (e) {
      if (timer) clearTimeout(timer)
      reject(e)
    }
  })
}

export async function sendEmail(options: SmtpEmailOptions): Promise<{ success: boolean; error?: string }> {
  const cleanTo = (options.to || '').replace(/[\r\n\x00-\x1f]/g, '').trim()
  const cleanSubject = (options.subject || '').replace(/[\r\n\x00-\x1f]/g, '').trim()
  if (!cleanTo || !cleanSubject) {
    return { success: false, error: 'Địa chỉ người nhận hoặc tiêu đề không hợp lệ.' }
  }

  // RFC 5321 dot-stuffing to prevent premature data termination / SMTP smuggling
  const cleanHtml = (options.html || '').replace(/^\./gm, '..')
  const safeOptions: SmtpEmailOptions = {
    to: cleanTo,
    subject: cleanSubject,
    html: cleanHtml,
  }

  const host = process.env.SMTP_HOST || 'smtp.maileroo.com'
  const port = parseInt(process.env.SMTP_PORT || '465', 10)
  const user = process.env.SMTP_USER || 'no-reply@pay2pay.vn'
  const pass = process.env.SMTP_PASS || 'REDACTED_SMTP_SECRET_KEY'
  const from = process.env.MAIL_FROM || `"Paypay - Pay Linggo" <${user}>`

  const config: SmtpConfig = { host, port, user, pass, from }

  try {
    // 1. Try Cloudflare Sockets if running on Cloudflare Edge
    if (typeof (globalThis as unknown as { WebSocketPair?: unknown }).WebSocketPair !== 'undefined') {
      try {
        await sendSmtpViaEdgeSocket(safeOptions, config)
        return { success: true }
      } catch (edgeErr: unknown) {
        console.error('Edge socket send error:', edgeErr)
        throw edgeErr
      }
    }

    // 2. Node.js runtime fallback (local dev / test) via direct TLS socket
    await sendSmtpViaNodeTls(safeOptions, config)
    return { success: true }
  } catch (err: unknown) {
    console.error('Failed to send email via SMTP:', err)
    return { success: false, error: err instanceof Error ? err.message : 'Lỗi gửi email SMTP' }
  }
}
