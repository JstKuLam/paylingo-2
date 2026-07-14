import { useSyncExternalStore } from 'react'

export type ThemeType = 'dark' | 'light'

const THEME_EVENT = 'paylingo-theme-change'

function normalizeTheme(value: string | null): ThemeType {
  return value === 'light' || value?.startsWith('light-') ? 'light' : 'dark'
}

function getThemeSnapshot(): ThemeType {
  if (typeof window === 'undefined') return 'dark'
  return normalizeTheme(localStorage.getItem('theme'))
}

function subscribeToTheme(callback: () => void) {
  window.addEventListener('storage', callback)
  window.addEventListener(THEME_EVENT, callback)
  return () => {
    window.removeEventListener('storage', callback)
    window.removeEventListener(THEME_EVENT, callback)
  }
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, () => 'dark')

  const changeTheme = (newTheme: ThemeType) => {
    document.documentElement.setAttribute('data-theme', newTheme)
    document.documentElement.classList.toggle('dark', newTheme === 'dark')
    localStorage.setItem('theme', newTheme)
    window.dispatchEvent(new Event(THEME_EVENT))
  }

  const toggleTheme = () => {
    const nextTheme: ThemeType = theme === 'dark' ? 'light' : 'dark'
    changeTheme(nextTheme)
  }

  return { theme, changeTheme, toggleTheme }
}
