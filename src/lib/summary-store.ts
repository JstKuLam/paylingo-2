export type SummaryStyle = 'standard' | 'formal' | 'casual' | 'very_casual'

export interface SavedSummaryEntry {
  summary: string
  style: SummaryStyle
  updatedAt: string
}

export interface TargetSummaryBundle {
  byStyle: Partial<Record<SummaryStyle, SavedSummaryEntry>>
  latestStyle?: SummaryStyle
}

interface SummaryTarget {
  sessionId?: string
  folderId?: string
}

interface InFlightSummaryJob {
  promise: Promise<string>
  style: SummaryStyle
  startedAtMs: number
}

const STORAGE_KEY = 'paylingo_ai_summaries_v1'
const MAX_STORED_TARGETS = 150

let memoryStore: Record<string, TargetSummaryBundle> | null = null
const inFlightJobs = new Map<string, InFlightSummaryJob>()
const listeners = new Set<() => void>()

function notifyListeners() {
  for (const listener of listeners) {
    try {
      listener()
    } catch {
      // Ignore listener errors
    }
  }
}

export function subscribeSummaryStore(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function normalizeSummaryStyle(raw?: string | null): SummaryStyle {
  if (raw === 'formal' || raw === 'casual' || raw === 'very_casual') {
    return raw
  }
  return 'standard'
}

export function getTargetSummaryKey(target: SummaryTarget): string {
  if (target.sessionId) return `session:${target.sessionId.trim()}`
  if (target.folderId) return `folder:${target.folderId.trim()}`
  return ''
}

function ensureStoreLoaded(): Record<string, TargetSummaryBundle> {
  if (memoryStore !== null) return memoryStore
  memoryStore = {}
  if (typeof window === 'undefined') return memoryStore
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return memoryStore
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      memoryStore = parsed as Record<string, TargetSummaryBundle>
    }
  } catch {
    memoryStore = {}
  }
  return memoryStore
}

function persistStore() {
  if (typeof window === 'undefined' || !memoryStore) return
  try {
    const keys = Object.keys(memoryStore)
    if (keys.length > MAX_STORED_TARGETS) {
      const trimmed: Record<string, TargetSummaryBundle> = {}
      const keepKeys = keys.slice(keys.length - MAX_STORED_TARGETS)
      for (const k of keepKeys) {
        trimmed[k] = memoryStore[k]
      }
      memoryStore = trimmed
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryStore))
  } catch {
    // Ignore storage quota errors
  }
}

export function getSavedSummaryBundle(target: SummaryTarget): TargetSummaryBundle {
  const key = getTargetSummaryKey(target)
  if (!key) return { byStyle: {} }
  const store = ensureStoreLoaded()
  return store[key] ?? { byStyle: {} }
}

export function getSavedSummary(
  target: SummaryTarget,
  preferredStyle?: SummaryStyle
): SavedSummaryEntry | null {
  const bundle = getSavedSummaryBundle(target)
  if (preferredStyle && bundle.byStyle[preferredStyle]?.summary) {
    return bundle.byStyle[preferredStyle] ?? null
  }
  if (bundle.latestStyle && bundle.byStyle[bundle.latestStyle]?.summary) {
    return bundle.byStyle[bundle.latestStyle] ?? null
  }
  const firstAvailable = Object.values(bundle.byStyle).find((item) => item && item.summary)
  return firstAvailable ?? null
}

export function saveSummaryToStore(
  target: SummaryTarget,
  style: SummaryStyle,
  summary: string,
  updatedAt: string = new Date().toISOString()
): void {
  const key = getTargetSummaryKey(target)
  const cleanSummary = summary.trim()
  if (!key || !cleanSummary) return

  const store = ensureStoreLoaded()
  const existing = store[key] ?? { byStyle: {} }
  const normalizedStyle = normalizeSummaryStyle(style)

  store[key] = {
    byStyle: {
      ...existing.byStyle,
      [normalizedStyle]: {
        summary: cleanSummary,
        style: normalizedStyle,
        updatedAt,
      },
    },
    latestStyle: normalizedStyle,
  }
  persistStore()
  notifyListeners()
}

export function hydrateSummariesFromCloud(
  target: SummaryTarget,
  rows: Array<{ style?: string | null; summary_text?: string | null; created_at?: string | null }>
): TargetSummaryBundle {
  const key = getTargetSummaryKey(target)
  if (!key || !Array.isArray(rows) || rows.length === 0) {
    return getSavedSummaryBundle(target)
  }

  const store = ensureStoreLoaded()
  const existing = store[key] ?? { byStyle: {} }
  const nextByStyle: Partial<Record<SummaryStyle, SavedSummaryEntry>> = { ...existing.byStyle }
  let newestStyle: SummaryStyle | undefined = existing.latestStyle

  // Rows are ordered by created_at DESC from API; first seen per style is newest from cloud
  const seenStyles = new Set<SummaryStyle>()
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const text = typeof row?.summary_text === 'string' ? row.summary_text.trim() : ''
    if (!text) continue
    const st = normalizeSummaryStyle(row.style)
    if (i === 0 && !newestStyle) {
      newestStyle = st
    }
    if (seenStyles.has(st)) continue
    seenStyles.add(st)

    const cloudDate = row.created_at || new Date().toISOString()
    const localEntry = nextByStyle[st]
    if (!localEntry || !localEntry.summary) {
      nextByStyle[st] = {
        summary: text,
        style: st,
        updatedAt: cloudDate,
      }
      if (i === 0) {
        newestStyle = st
      }
    }
  }

  store[key] = {
    byStyle: nextByStyle,
    latestStyle: newestStyle ?? existing.latestStyle,
  }
  persistStore()
  notifyListeners()
  return store[key]
}

export function clearSummariesForTarget(target: SummaryTarget): void {
  const key = getTargetSummaryKey(target)
  if (!key) return
  const store = ensureStoreLoaded()
  if (key in store) {
    delete store[key]
    persistStore()
  }
  inFlightJobs.delete(key)
  notifyListeners()
}

export function getInFlightSummaryJob(target: SummaryTarget): InFlightSummaryJob | null {
  const key = getTargetSummaryKey(target)
  if (!key) return null
  return inFlightJobs.get(key) ?? null
}

export function runSummaryJob(
  target: SummaryTarget,
  style: SummaryStyle,
  fetcher: () => Promise<string>
): Promise<string> {
  const key = getTargetSummaryKey(target)
  if (!key) return fetcher()

  const existingJob = inFlightJobs.get(key)
  if (existingJob && existingJob.style === style) {
    return existingJob.promise
  }

  const startedAtMs = Date.now()
  const promise = fetcher()
    .then((summary) => {
      saveSummaryToStore(target, style, summary)
      return summary
    })
    .finally(() => {
      const current = inFlightJobs.get(key)
      if (current && current.startedAtMs === startedAtMs && current.style === style) {
        inFlightJobs.delete(key)
      }
      notifyListeners()
    })

  inFlightJobs.set(key, {
    promise,
    style,
    startedAtMs,
  })
  notifyListeners()
  return promise
}
