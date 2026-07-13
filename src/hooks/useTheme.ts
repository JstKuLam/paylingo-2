import { useState, useEffect } from 'react'

export type ThemeType = 'dark' | 'light'

export function useTheme() {
  const [theme, setTheme] = useState<ThemeType>('dark')

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme')
    if (savedTheme) {
      // Map legacy themes to 'light' or 'dark'
      let normalizedTheme: ThemeType = 'dark'
      if (savedTheme === 'light' || savedTheme.startsWith('light-')) {
        normalizedTheme = 'light'
      } else {
        normalizedTheme = 'dark'
      }
      setTheme(normalizedTheme)
      document.documentElement.setAttribute('data-theme', normalizedTheme)
    } else {
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
    const nextTheme: ThemeType = theme === 'dark' ? 'light' : 'dark'
    changeTheme(nextTheme)
  }

  return { theme, changeTheme, toggleTheme }
}

