/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs')
const path = require('node:path')
const { DatabaseSync } = require('node:sqlite')

let localDbInstance = null

function getLocalD1() {
  if (localDbInstance) return localDbInstance

  const dataDir = path.join(process.cwd(), '.data')
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }

  const dbFilePath = path.join(dataDir, 'paylingo_d1.sqlite')
  const isNew = !fs.existsSync(dbFilePath)
  const sqlite = new DatabaseSync(dbFilePath)
  sqlite.exec('PRAGMA foreign_keys = ON;')
  sqlite.exec('PRAGMA journal_mode = WAL;')
  sqlite.exec('PRAGMA synchronous = NORMAL;')

  // Initialize schema and seed if new
  if (isNew) {
    try {
      const schemaPath = path.join(process.cwd(), 'supabase', 'd1-schema.sql')
      if (fs.existsSync(schemaPath)) {
        sqlite.exec(fs.readFileSync(schemaPath, 'utf8'))
      }
      const seedPath = path.join(process.cwd(), 'scratch', 'd1_seed.sql')
      if (fs.existsSync(seedPath)) {
        sqlite.exec(fs.readFileSync(seedPath, 'utf8'))
      }
    } catch (e) {
      console.warn('Local SQLite initialization notice:', e)
    }
  }

  const d1Wrapper = {
    prepare(query) {
      let boundParams = []
      const stmtObj = {
        _sql: query,
        _params: boundParams,
        bind(...values) {
          boundParams = values.map(v => {
            if (typeof v === 'boolean') return v ? 1 : 0
            if (v instanceof Date) return v.toISOString()
            if (v === undefined) return null
            return v
          })
          stmtObj._params = boundParams
          return stmtObj
        },
        async first(colName) {
          try {
            const stmt = sqlite.prepare(query)
            const row = stmt.get(...boundParams)
            if (!row) return null
            if (colName && typeof row === 'object' && row !== null) {
              return row[colName] ?? null
            }
            return row
          } catch (err) {
            console.error(`D1 first error on "${query}":`, err)
            throw err
          }
        },
        async all() {
          try {
            const stmt = sqlite.prepare(query)
            const rows = stmt.all(...boundParams)
            const metaInfo = sqlite.prepare('SELECT changes() as changes, last_insert_rowid() as last_row_id').get()
            return {
              results: rows || [],
              success: true,
              meta: {
                changes: Number(metaInfo?.changes ?? 0),
                last_row_id: Number(metaInfo?.last_row_id ?? 0),
              }
            }
          } catch (err) {
            return { results: [], success: false, error: err.message }
          }
        },
        async run() {
          try {
            const stmt = sqlite.prepare(query)
            const result = stmt.run(...boundParams)
            return {
              success: true,
              meta: {
                changes: result?.changes ?? 0,
                last_row_id: Number(result?.lastInsertRowid ?? 0),
              }
            }
          } catch (err) {
            return { success: false, error: err.message }
          }
        }
      }
      return stmtObj
    },
    async batch(statements) {
      if (!Array.isArray(statements) || statements.length === 0) {
        return []
      }
      const results = []
      sqlite.exec('BEGIN TRANSACTION;')
      try {
        for (const st of statements) {
          const res = await st.all()
          if (!res.success) {
            throw new Error(res.error || 'D1 batch statement failed')
          }
          results.push(res)
        }
        sqlite.exec('COMMIT;')
      } catch (err) {
        sqlite.exec('ROLLBACK;')
        throw err
      }
      return results
    },
    async exec(query) {
      const start = Date.now()
      sqlite.exec(query)
      return { count: 1, duration: Date.now() - start }
    }
  }

  localDbInstance = d1Wrapper
  return d1Wrapper
}

module.exports = { getLocalD1 }
