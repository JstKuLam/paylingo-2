import { useSyncExternalStore } from 'react'

export type ThemeType = 'dark' | 'light'

const THEME_EVENT = 'paylingo-theme-change'

function getDefaultTheme(): ThemeType {
  if (typeof window !== 'undefined' && window.innerWidth <= 760) {
    return 'dark'
  }
  return 'light'
}

function normalizeTheme(value: string | null): ThemeType {
  if (!value) return getDefaultTheme()
  return value === 'light' || value?.startsWith('light-') ? 'light' : 'dark'
}

function getThemeSnapshot(): ThemeType {
  if (typeof window === 'undefined') return 'light'
  try {
    const isMobile = window.innerWidth <= 760
    if (isMobile && !localStorage.getItem('paylingo_mobile_dark_v1')) {
      localStorage.setItem('theme', 'dark')
      localStorage.setItem('paylingo_mobile_dark_v1', '1')
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', 'dark')
        document.documentElement.classList.add('dark')
      }
      return 'dark'
    }
    return normalizeTheme(localStorage.getItem('theme'))
  } catch {
    return getDefaultTheme()
  }
}

function subscribeToTheme(callback: () => void) {
  if (typeof window === 'undefined') return () => undefined
  window.addEventListener('storage', callback)
  window.addEventListener(THEME_EVENT, callback)
  return () => {
    window.removeEventListener('storage', callback)
    window.removeEventListener(THEME_EVENT, callback)
  }
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, () => 'light')

  const changeTheme = (newTheme: ThemeType) => {
    const validTheme: ThemeType = newTheme === 'light' ? 'light' : 'dark'
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', validTheme)
      document.documentElement.classList.toggle('dark', validTheme === 'dark')
    }
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('theme', validTheme)
      }
    } catch {}
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(THEME_EVENT))
    }
  }

  const toggleTheme = () => {
    const nextTheme: ThemeType = theme === 'dark' ? 'light' : 'dark'
    changeTheme(nextTheme)
  }

  return { theme, changeTheme, toggleTheme }
}
