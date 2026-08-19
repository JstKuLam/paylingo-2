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
          boundParams = values.map(v => v === undefined ? null : v)
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
            return { results: rows || [], success: true }
          } catch (err) {
            console.error(`D1 all error on "${query}":`, err)
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
            console.error(`D1 run error on "${query}":`, err)
            return { success: false, error: err.message }
          }
        }
      }
      return stmtObj
    },
    async batch(statements) {
      const results = []
      sqlite.exec('BEGIN TRANSACTION;')
      try {
        for (const st of statements) {
          const res = await st.all()
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
