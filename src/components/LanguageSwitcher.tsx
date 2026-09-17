'use client'

import { Globe } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useLanguage } from '@/hooks/useLanguage'
import { Language } from '@/lib/i18n'

interface LanguageSwitcherProps {
  className?: string
  showIcon?: boolean
  size?: 'default' | 'touch'
}

const LANGUAGES: { code: Language; label: string; title: string }[] = [
  { code: 'vi', label: 'VI', title: 'Tiếng Việt' },
  { code: 'en', label: 'EN', title: 'English' },
  { code: 'zh', label: 'CHN', title: '中文' },
]

export default function LanguageSwitcher({ className = '', showIcon = true, size = 'default' }: LanguageSwitcherProps) {
  const { language, changeLanguage } = useLanguage()

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {showIcon && (
        <span className="flex items-center justify-center text-muted-foreground" aria-hidden="true">
          <Globe />
        </span>
      )}
      <ToggleGroup
        variant="outline"
        size={size}
        spacing={0}
        value={[language]}
        onValueChange={(values) => {
          const nextLanguage = values[0] as Language | undefined
          if (nextLanguage) changeLanguage(nextLanguage)
        }}
        aria-label="Language / Ngôn ngữ / 语言"
      >
        {LANGUAGES.map((lang) => (
          <ToggleGroupItem key={lang.code} value={lang.code} title={lang.title}>
            {lang.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}
