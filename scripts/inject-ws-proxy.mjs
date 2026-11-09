import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const WORKER_PATH = path.resolve(process.cwd(), '.vercel/output/static/_worker.js/index.js')

const PROXY_SNIPPET = `
async function __paylingoHmacHex(secret, payload) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function __paylingoVerifyWsTicket(ticket, masterKey) {
  if (!ticket || typeof ticket !== 'string' || !masterKey) return false;
  const parts = ticket.trim().split('.');
  if (parts.length !== 5 || parts[0] !== 'paylingo_ws_v1') return false;
  const exp = Number.parseInt(parts[1], 10);
  const nonce = parts[2];
  const safeUser = parts[3];
  const sig = parts[4];
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  if (!/^[0-9a-f]{24}$/.test(nonce) || !/^[0-9a-f]{64}$/.test(sig)) return false;
  const payload = \`paylingo_ws_v1:\${exp}:\${nonce}:\${safeUser}\`;
  const expected = await __paylingoHmacHex(masterKey.trim(), payload);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return diff === 0;
}

async function __handleSonioxWsProxy(request, env) {
  const upgrade = (request.headers.get('Upgrade') || '').toLowerCase();
  if (upgrade !== 'websocket') {
    return new Response('Expected WebSocket Upgrade', { status: 426 });
  }
  const reqUrl = new URL(request.url);
  const origin = request.headers.get('Origin');
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      if (originHost !== reqUrl.host && !originHost.endsWith('.paylingo.pages.dev')) {
        return new Response('Forbidden Origin', { status: 403 });
      }
    } catch {
      return new Response('Invalid Origin', { status: 403 });
    }
  }

  const masterKey = (env?.SONIOX_API_KEY || '').trim();
  if (!masterKey) {
    return new Response('Soniox key not configured', { status: 500 });
  }

  let upstreamRes;
  try {
    upstreamRes = await fetch('https://stt-rt.soniox.com/transcribe-websocket', {
      headers: { Upgrade: 'websocket' },
    });
  } catch {
    return new Response('Upstream connection error', { status: 502 });
  }
  const upstreamWs = upstreamRes.webSocket;
  if (!upstreamWs) {
    return new Response('Upstream WebSocket unavailable', { status: 502 });
  }
  upstreamWs.accept();

  const pair = new WebSocketPair();
  const clientWs = pair[0];
  const serverWs = pair[1];
  serverWs.accept();

  let state = 'init';
  const pendingFrames = [];

  serverWs.addEventListener('message', async (event) => {
    if (state === 'closed') return;
    if (state === 'init') {
      state = 'authenticating';
      try {
        const raw = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data);
        const cfg = JSON.parse(raw);
        const valid = await __paylingoVerifyWsTicket(cfg?.api_key, masterKey);
        if (!valid) {
          state = 'closed';
          try { serverWs.close(1008, 'Unauthorized WebSocket ticket'); } catch {}
          try { upstreamWs.close(1000, 'Unauthorized'); } catch {}
          return;
        }
        cfg.api_key = masterKey;
        cfg.model = 'stt-rt-v6';
        upstreamWs.send(JSON.stringify(cfg));
        for (const frame of pendingFrames) {
          upstreamWs.send(frame);
        }
        pendingFrames.length = 0;
        state = 'ready';
      } catch {
        state = 'closed';
        try { serverWs.close(1008, 'Invalid handshake payload'); } catch {}
        try { upstreamWs.close(1000, 'Invalid handshake'); } catch {}
      }
      return;
    }
    if (state === 'authenticating') {
      if (pendingFrames.length < 64) {
        pendingFrames.push(event.data);
      }
      return;
    }
    if (state === 'ready') {
      try {
        upstreamWs.send(event.data);
      } catch {}
    }
  });

  upstreamWs.addEventListener('message', (event) => {
    if (state === 'closed') return;
    try {
      serverWs.send(event.data);
    } catch {}
  });

  upstreamWs.addEventListener('close', (event) => {
    state = 'closed';
    try {
      serverWs.close(event.code || 1000, event.reason || '');
    } catch {}
  });

  upstreamWs.addEventListener('error', () => {
    state = 'closed';
    try {
      serverWs.close(1011, 'Upstream error');
    } catch {}
  });

  serverWs.addEventListener('close', (event) => {
    state = 'closed';
    try {
      upstreamWs.close(event.code || 1000, event.reason || '');
    } catch {}
  });

  serverWs.addEventListener('error', () => {
    state = 'closed';
    try {
      upstreamWs.close(1000, 'Client error');
    } catch {}
  });

  return new Response(null, { status: 101, webSocket: clientWs });
}
`

async function main() {
  const source = await readFile(WORKER_PATH, 'utf8')
  if (source.includes('__handleSonioxWsProxy')) {
    console.log('⚡️ Soniox Edge WebSocket proxy already injected.')
    return
  }

  const target = 'var ks={async fetch(e,t,r){'
  if (!source.includes(target)) {
    throw new Error(`Could not find worker fetch target in ${WORKER_PATH}`)
  }

  const replacement = `${PROXY_SNIPPET}\nvar ks={async fetch(e,t,r){if(new URL(e.url).pathname==="/api/ws/soniox")return __handleSonioxWsProxy(e,t);`
  const updated = source.replace(target, replacement)
  await writeFile(WORKER_PATH, updated, 'utf8')
  console.log('✨ Injected Soniox Zero-Exposure Edge WebSocket Proxy (/api/ws/soniox) into _worker.js!')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
