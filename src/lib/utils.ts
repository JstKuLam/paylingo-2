import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatTimeline(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const pad = (n: number) => String(n).padStart(2, '0')
  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
  }
  return `${pad(minutes)}:${pad(seconds)}`
}

export function scrollIntoViewAsync(
  element: Element,
  options: ScrollIntoViewOptions = { behavior: 'smooth', block: 'center' },
  scroller: Element | Window | null = typeof window !== 'undefined' ? window : null
): Promise<void> {
  const result = element.scrollIntoView(options) as unknown
  if (result instanceof Promise) {
    return result as Promise<void>
  }
  if (!scroller) return Promise.resolve()

  return new Promise((resolve) => {
    let timeoutId: ReturnType<typeof setTimeout>
    const finish = () => {
      clearTimeout(timeoutId)
      scroller.removeEventListener('scrollend', finish)
      scroller.removeEventListener('scroll', onScroll)
      resolve()
    }
    const onScroll = () => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(finish, 100)
    }
    scroller.addEventListener('scrollend', finish, { once: true })
    scroller.addEventListener('scroll', onScroll, { passive: true })
    timeoutId = setTimeout(finish, 100)
  })
}
