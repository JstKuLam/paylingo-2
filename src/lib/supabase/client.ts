import { authClient } from '../auth-client'

/**
 * Compatibility wrapper for client components previously using Supabase client.
 * Routes all auth directly to D1 Native Auth.
 */
export function createClient() {
  return {
    auth: authClient,
    from(tableName: string) {
      return {
        select(_columns?: string) {
          void _columns
          return {
            async order(col: string, options?: { ascending?: boolean }) {
              // Direct fetch to API endpoints for sessions or folders
              if (tableName === 'sessions' || tableName === 'folders') {
                const res = await fetch(`/api/history?table=${tableName}&order=${col}&asc=${options?.ascending ? '1' : '0'}`)
                const data = await res.json()
                return { data: data.items || [], error: null }
              }
              return { data: [], error: null }
            },
            async eq(col: string, val: string | number | boolean) {
              return {
                async single() {
                  const res = await fetch(`/api/history?table=${tableName}&${col}=${encodeURIComponent(String(val))}&single=1`)
                  const data = await res.json()
                  return { data: data.item || null, error: null }
                },
                data: [],
                error: null
              }
            }
          }
        },
        async delete() {
          return {
            async eq(col: string, val: string | number | boolean) {
              const res = await fetch(`/api/history`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ table: tableName, field: col, value: val }),
              })
              const data = await res.json()
              return { error: data.error ? new Error(data.error) : null }
            }
          }
        },
        async update(payload: Record<string, unknown>) {
          return {
            async eq(col: string, val: string | number | boolean) {
              const res = await fetch(`/api/history`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ table: tableName, field: col, value: val, payload }),
              })
              const data = await res.json()
              return { error: data.error ? new Error(data.error) : null }
            }
          }
        }
      }
    }
  }
}
