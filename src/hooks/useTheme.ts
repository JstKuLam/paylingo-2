import { useState, useEffect } from 'react'

export type ThemeType = 'dark' | 'light-ios' | 'light-glass' | 'light-warm'

export function useTheme() {
  const [theme, setTheme] = useState<ThemeType>('dark')

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as ThemeType | null
    if (savedTheme) {
      // Map legacy 'light' to 'light-ios'
      const normalizedTheme = savedTheme === ('light' as any) ? 'light-ios' : savedTheme
      setTheme(normalizedTheme)
      document.documentElement.setAttribute('data-theme', normalizedTheme)
    } else {
      // Default to dark mode for PayLingo
      setTheme('dark')
      document.documentElement.setAttribute('data-theme', 'dark')
    }
  }, [])

  const changeTheme = (newTheme: ThemeType) => {
    setTheme(newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
    localStorage.setItem('theme', newTheme)
  }

  const toggleTheme = () => {
    const themes: ThemeType[] = ['dark', 'light-ios', 'light-glass', 'light-warm']
    const currentIndex = themes.indexOf(theme)
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % themes.length
    const nextTheme = themes[nextIndex]
    changeTheme(nextTheme)
  }

  return { theme, changeTheme, toggleTheme }
}

