import { getFlagCountryCode } from '@/lib/languages'

interface LanguageFlagProps {
  code?: string | null
  className?: string
}

export default function LanguageFlag({ code, className = 'lang-flag' }: LanguageFlagProps) {
  const flagCode = getFlagCountryCode(code)

  return (
    <span className={className} aria-hidden="true">
      {flagCode === 'globe' ? (
        <svg viewBox="0 0 24 24" width="18" height="18" className="lang-flag__svg">
          <rect width="24" height="24" className="flag-fill-globe" />
          <circle cx="12" cy="12" r="6.8" fill="none" className="flag-stroke-white" strokeWidth="1.6" />
          <ellipse cx="12" cy="12" rx="3.2" ry="6.8" fill="none" className="flag-stroke-white" strokeWidth="1.4" />
          <line x1="5.4" y1="12" x2="18.6" y2="12" className="flag-stroke-white" strokeWidth="1.4" />
        </svg>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={`/flags/${flagCode}.svg`}
          alt=""
          width={18}
          height={18}
          className="lang-flag__svg"
          decoding="async"
        />
      )}
    </span>
  )
}
