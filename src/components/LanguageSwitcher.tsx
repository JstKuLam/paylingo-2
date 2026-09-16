'use client'

import { Globe } from 'lucide-react'
import { useLanguage } from '@/hooks/useLanguage'
import { Language } from '@/lib/i18n'

interface LanguageSwitcherProps {
  className?: string
  showIcon?: boolean
}

const LANGUAGES: { code: Language; label: string; title: string }[] = [
  { code: 'vi', label: 'VI', title: 'Tiếng Việt' },
  { code: 'en', label: 'EN', title: 'English' },
  { code: 'zh', label: 'CHN', title: '中文' },
]

export default function LanguageSwitcher({ className = '', showIcon = true }: LanguageSwitcherProps) {
  const { language, changeLanguage } = useLanguage()

  return (
    <div
      className={`inline-flex items-center gap-0.5 p-1 rounded-lg border border-border bg-surface/80 backdrop-blur-sm shadow-xs transition-colors ${className}`}
      role="group"
      aria-label="Language / Ngôn ngữ / 语言"
    >
      {showIcon && (
        <span className="px-1 text-text-soft flex items-center justify-center pointer-events-none" aria-hidden="true">
          <Globe className="w-3.5 h-3.5" />
        </span>
      )}
      {LANGUAGES.map((lang) => {
        const isActive = language === lang.code
        return (
          <button
            key={lang.code}
            type="button"
            onClick={() => changeLanguage(lang.code)}
            className={`px-2 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
              isActive
                ? 'bg-primary text-white shadow-xs font-bold'
                : 'text-text-muted hover:text-foreground hover:bg-surface-muted/60'
            }`}
            title={lang.title}
            aria-pressed={isActive}
          >
            {lang.label}
          </button>
        )
      })}
    </div>
  )
}
