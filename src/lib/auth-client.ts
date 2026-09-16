export interface ClientUser {
  id: string
  email: string
  email_confirmed_at?: string | null
  created_at: string
  user_metadata?: {
    full_name?: string
    name?: string
    username?: string
  }
}

export interface ClientSession {
  user: ClientUser
  access_token: string
}

type AuthListener = (event: 'SIGNED_IN' | 'SIGNED_OUT' | 'INITIAL_SESSION', session: ClientSession | null) => void

const listeners = new Set<AuthListener>()
let cachedUser: ClientUser | null = null
let hasFetchedInitial = false

function notify(event: 'SIGNED_IN' | 'SIGNED_OUT' | 'INITIAL_SESSION', session: ClientSession | null) {
  listeners.forEach(cb => {
    try {
      cb(event, session)
    } catch (e) {
      console.error('Auth listener error:', e)
    }
  })
}

export const authClient = {
  async getUser(): Promise<{ data: { user: ClientUser | null }; error: Error | null }> {
    try {
      const res = await fetch('/api/auth/me', {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' },
      })
      if (!res.ok) {
        cachedUser = null
        return { data: { user: null }, error: null }
      }
      const data = await res.json()
      cachedUser = data.user || null
      hasFetchedInitial = true
      return { data: { user: cachedUser }, error: null }
    } catch (err: any) {
      return { data: { user: cachedUser }, error: err }
    }
  },

  async getSession(): Promise<{ data: { session: ClientSession | null }; error: Error | null }> {
    const { data, error } = await this.getUser()
    if (!data.user) {
      return { data: { session: null }, error }
    }
    const session: ClientSession = {
      user: data.user,
      access_token: 'cookie_session',
    }
    return { data: { session }, error: null }
  },

  async signInWithOtp({ email, lang }: { email: string; lang?: string }): Promise<{ error: Error | null }> {
    try {
      const res = await fetch('/api/auth/send-magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, lang }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        return { error: new Error(data.error || 'Gửi mã xác thực thất bại') }
      }
      return { error: null }
    } catch (err: any) {
      return { error: err }
    }
  },

  async verifyOtp({ token }: { token: string }): Promise<{ data: { user: ClientUser | null }; error: Error | null }> {
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        return { data: { user: null }, error: new Error(data.error || 'Xác thực thất bại') }
      }
      cachedUser = data.user
      const session: ClientSession = {
        user: data.user,
        access_token: 'cookie_session',
      }
      notify('SIGNED_IN', session)
      return { data: { user: cachedUser }, error: null }
    } catch (err: any) {
      return { data: { user: null }, error: err }
    }
  },

  async signOut(): Promise<{ error: Error | null }> {
    try {
      await fetch('/api/auth/signout', { method: 'POST' })
      cachedUser = null
      notify('SIGNED_OUT', null)
      return { error: null }
    } catch (err: any) {
      cachedUser = null
      notify('SIGNED_OUT', null)
      return { error: err }
    }
  },

  onAuthStateChange(callback: AuthListener): { data: { subscription: { unsubscribe: () => void } } } {
    listeners.add(callback)
    // Send current session if already fetched
    if (hasFetchedInitial) {
      const sess = cachedUser ? { user: cachedUser, access_token: 'cookie_session' } : null
      callback('INITIAL_SESSION', sess)
    } else {
      this.getUser().then(({ data }) => {
        const sess = data.user ? { user: data.user, access_token: 'cookie_session' } : null
        callback('INITIAL_SESSION', sess)
      })
    }

    return {
      data: {
        subscription: {
          unsubscribe: () => {
            listeners.delete(callback)
          }
        }
      }
    }
  }
}
