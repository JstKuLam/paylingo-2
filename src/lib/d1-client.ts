export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = unknown>(colName?: string): Promise<T | null>
  all<T = unknown>(): Promise<{ results: T[]; success: boolean; error?: string }>
  run(): Promise<{ success: boolean; meta?: { changes?: number; last_row_id?: number }; error?: string }>
  _sql?: string
  _params?: unknown[]
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<{ results?: T[]; success: boolean }[]>
  exec(query: string): Promise<{ count: number; duration: number }>
}

let cachedDb: D1Database | null = null

function loadLocalDatabase(): D1Database | null {
  try {
    const proc = (globalThis as any).process
    if (proc && proc.env?.NEXT_RUNTIME !== 'edge') {
      let req: any = null
      if (typeof proc.getBuiltinModule === 'function') {
        const mod = proc.getBuiltinModule('node:module')
        if (mod && typeof mod.createRequire === 'function') {
          req = mod.createRequire(proc.cwd() + '/package.json')
        }
      }
      if (req) {
        const localPath = ['./src/lib/d1', 'local.js'].join('-')
        const local = req(localPath)
        return local.getLocalD1()
      }
    }
  } catch (e) {
    // Edge runtime or require not supported
  }
  return null
}

/**
 * Returns the active Cloudflare D1 database instance.
 * In Cloudflare Edge / Pages, it reads the injected DB binding.
 * In Node.js (local dev / testing), it loads the local SQLite adapter.
 */
export function getD1(): D1Database {
  if (cachedDb) return cachedDb

  const g = globalThis as any
  if (g.DB && typeof g.DB.prepare === 'function') {
    cachedDb = g.DB
    return g.DB
  }
  if (g.__env__?.DB && typeof g.__env__.DB.prepare === 'function') {
    cachedDb = g.__env__.DB
    return g.__env__.DB
  }
  if (process.env.DB && typeof (process.env.DB as any).prepare === 'function') {
    cachedDb = process.env.DB as unknown as D1Database
    return cachedDb
  }

  const local = loadLocalDatabase()
  if (local) {
    cachedDb = local
    return local
  }

  // Fallback safe mock if neither environment is present
  return {
    prepare(query: string) {
      return {
        _sql: query,
        _params: [],
        bind() { return this },
        async first() { return null },
        async all() { return { results: [], success: false, error: 'D1 binding not initialized' } },
        async run() { return { success: false, error: 'D1 binding not initialized' } }
      }
    },
    async batch() { return [] },
    async exec() { return { count: 0, duration: 0 } }
  }
}
