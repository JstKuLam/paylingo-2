'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { useLanguage } from '@/hooks/useLanguage'
import { Language } from '@/lib/i18n'
import LanguageFlag from '@/components/LanguageFlag'

interface LanguageSwitcherProps {
  className?: string
  showIcon?: boolean
  size?: 'default' | 'touch'
}

const LANGUAGES: { code: Language; label: string; title: string }[] = [
  { code: 'vi', label: 'VI', title: 'Việt Nam' },
  { code: 'en', label: 'EN', title: 'English' },
  { code: 'zh', label: 'ZH', title: '中文' },
]

export default function LanguageSwitcher({ className = '' }: LanguageSwitcherProps) {
  const { language, changeLanguage } = useLanguage()
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const currentLang = LANGUAGES.find((l) => l.code === language) ?? LANGUAGES[0]

  useEffect(() => {
    if (!isOpen) return
    const handleOutside = (event: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [isOpen])

  return (
    <div className={`lang-dropdown ${className}`.trim()} ref={menuRef}>
      <button
        type="button"
        className="btn lang-dropdown__btn"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Language / Ngôn ngữ / 语言"
        title={currentLang.title}
      >
        <LanguageFlag code={currentLang.code} className="lang-flag lang-flag--sm" />
        <span>{currentLang.label}</span>
        <ChevronDown className="lang-dropdown__chev" aria-hidden="true" />
      </button>

      {isOpen && (
        <div
          className="lang-dropdown__menu"
          role="listbox"
          aria-label="Language / Ngôn ngữ / 语言"
        >
          {LANGUAGES.map((lang) => {
            const isSelected = language === lang.code
            return (
              <button
                key={lang.code}
                type="button"
                role="option"
                aria-selected={isSelected}
                className="menu__opt"
                onClick={() => {
                  changeLanguage(lang.code)
                  setIsOpen(false)
                }}
              >
                <LanguageFlag code={lang.code} className="lang-flag lang-flag--md" />
                <span className="menu__name">{lang.title}</span>
                <Check className="i menu__check" aria-hidden="true" />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
