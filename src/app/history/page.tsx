'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CalendarDays,
  Check,
  ChevronRight,
  CircleCheck,
  Clock3,
  CloudLightning,
  Folder,
  FolderOpen,
  FolderPlus,
  ListChecks,
  Loader2,
  Search,
  X,
} from 'lucide-react'
import WorkspaceHeader from '@/components/WorkspaceHeader'
import { claimLegacyLocalData, db, LocalFolder, LocalSession } from '@/lib/db'
import { authClient } from '@/lib/auth-client'
import { getPartnerLanguage } from '@/lib/languages'
import { syncPendingData } from '@/lib/sync-manager'
import { useLanguage } from '@/hooks/useLanguage'
import type { I18nTranslations } from '@/lib/i18n'

function formatDuration(totalSeconds: number, t: I18nTranslations) {
  const safeSeconds = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  if (hours > 0) {
    return t.durationHoursMinutes.replace('{hours}', String(hours)).replace('{minutes}', String(minutes))
  }
  return t.durationMinutes.replace('{minutes}', String(minutes))
}

export default function HistoryPage() {
  const router = useRouter()
  const { language, t } = useLanguage()
  const [username, setUsername] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [sessions, setSessions] = useState<LocalSession[]>([])
  const [folders, setFolders] = useState<LocalFolder[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [isSelectMode, setIsSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [showFolderModal, setShowFolderModal] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const { data: { user }, error: userError } = await authClient.getUser()
      const currentOwnerId = user?.id
      const legacyUsername = user?.email?.split('@')[0]
      const name = user?.user_metadata?.username ||
                   user?.user_metadata?.full_name ||
                   user?.user_metadata?.name ||
                   user?.email?.split('@')[0]

      if (userError || !user || !name || !legacyUsername || !currentOwnerId) {
        router.replace('/')
        return
      }

      await claimLegacyLocalData(currentOwnerId, legacyUsername)
      const [localFolders, localSessions] = await Promise.all([
        db.folders.where('owner_id').equals(currentOwnerId).reverse().sortBy('created_at'),
        db.sessions.where('owner_id').equals(currentOwnerId).reverse().sortBy('started_at'),
      ])

      setUsername(name)
      setOwnerId(currentOwnerId)
      setFolders(localFolders)
      setSessions(localSessions)
      setLoadError('')

      // Sync cloud sessions and folders from Cloudflare D1
      const [foldersRes, sessionsRes] = await Promise.all([
        fetch('/api/history?table=folders').then(r => r.json()).catch(() => ({ items: [] })),
        fetch('/api/history?table=sessions').then(r => r.json()).catch(() => ({ items: [] })),
      ])

      type CloudFolderRecord = { id: string; owner_id?: string; username?: string; name: string; created_at: string; updated_at?: string }
      type CloudSessionRecord = { id: string; owner_id?: string; username?: string; folder_id?: string | null; name: string; partner_language: string; started_at: string; ended_at: string; duration_seconds: number; updated_at?: string }

      const cloudFolders: LocalFolder[] = ((foldersRes.items as CloudFolderRecord[]) || [])
        .filter((f) => !f.owner_id || f.owner_id === currentOwnerId)
        .map((f) => ({
          id: f.id,
          owner_id: currentOwnerId,
          username: f.username || name,
          name: f.name,
          created_at: f.created_at,
          updated_at: f.updated_at || new Date().toISOString(),
          sync_status: 'synced',
        }))

      const cloudSessions: LocalSession[] = ((sessionsRes.items as CloudSessionRecord[]) || [])
        .filter((s) => !s.owner_id || s.owner_id === currentOwnerId)
        .map((s) => ({
          id: s.id,
          owner_id: currentOwnerId,
          username: s.username || name,
          folder_id: s.folder_id,
          name: s.name,
          partner_language: s.partner_language,
          started_at: s.started_at,
          ended_at: s.ended_at,
          duration_seconds: s.duration_seconds,
          sync_status: 'synced',
          updated_at: s.updated_at || new Date().toISOString(),
        }))

      const localPendingSessionIds = new Set(
        localSessions.filter((s) => s.sync_status === 'pending').map((s) => s.id)
      )
      const localPendingFolderIds = new Set(
        localFolders.filter((f) => f.sync_status === 'pending').map((f) => f.id)
      )

      const safeCloudFolders = cloudFolders.filter((f) => !localPendingFolderIds.has(f.id))
      const safeCloudSessions = cloudSessions.filter((s) => !localPendingSessionIds.has(s.id))

      if (safeCloudFolders.length > 0 || safeCloudSessions.length > 0) {
        await db.transaction('rw', db.folders, db.sessions, async () => {
          if (safeCloudFolders.length > 0) {
            await db.folders.bulkPut(safeCloudFolders)
          }
          if (safeCloudSessions.length > 0) {
            await db.sessions.bulkPut(safeCloudSessions)
          }
        })

        const [updatedFolders, updatedSessions] = await Promise.all([
          db.folders.where('owner_id').equals(currentOwnerId).reverse().sortBy('created_at'),
          db.sessions.where('owner_id').equals(currentOwnerId).reverse().sortBy('started_at'),
        ])
        setFolders(updatedFolders)
        setSessions(updatedSessions)
      }
    } catch (error) {
      console.error('Failed to load history:', error)
      setLoadError(error instanceof Error ? error.message : 'Error loading history.')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    const loadTimer = window.setTimeout(() => void loadData(), 0)
    return () => window.clearTimeout(loadTimer)
  }, [loadData])

  const normalizedSearch = searchQuery.trim().toLocaleLowerCase()
  const filteredSessions = useMemo(
    () => sessions.filter((session) => session.name.toLocaleLowerCase().includes(normalizedSearch)),
    [normalizedSearch, sessions]
  )
  const filteredFolders = useMemo(
    () => folders.filter((folder) => folder.name.toLocaleLowerCase().includes(normalizedSearch)),
    [folders, normalizedSearch]
  )
  const independentSessions = filteredSessions.filter((session) => !session.folder_id)
  const visibleSessions = isSelectMode || normalizedSearch ? filteredSessions : independentSessions
  const pendingCount = sessions.filter((session) => session.sync_status !== 'synced').length
  const totalDuration = sessions.reduce((total, session) => total + session.duration_seconds, 0)

  const toggleSelectMode = () => {
    setIsSelectMode((current) => !current)
    setSelectedIds([])
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id]
    )
  }

  const handleSessionClick = (session: LocalSession) => {
    if (isSelectMode) {
      toggleSelect(session.id)
      return
    }
    router.push(`/history/sessions/${session.id}`)
  }

  const handleCreateFolder = async () => {
    const cleanName = folderName.trim()
    if (!cleanName || selectedIds.length < 2 || !ownerId) return

    setIsCreatingFolder(true)
    try {
      const folderId = crypto.randomUUID()
      const now = new Date().toISOString()
      const newFolder: LocalFolder = {
        id: folderId,
        owner_id: ownerId,
        username,
        name: cleanName,
        created_at: now,
        updated_at: now,
        sync_status: 'pending',
      }

      await db.transaction('rw', db.folders, db.sessions, async () => {
        await db.folders.put(newFolder)
        await db.sessions.where('id').anyOf(selectedIds).filter((s) => s.owner_id === ownerId).modify({
          folder_id: folderId,
          sync_status: 'pending',
          updated_at: now,
        })
      })

      setFolderName('')
      setShowFolderModal(false)
      setIsSelectMode(false)
      setSelectedIds([])
      await loadData()
      void syncPendingData()
    } catch (error) {
      console.error('Failed to create folder:', error)
      setLoadError('Error creating folder.')
    } finally {
      setIsCreatingFolder(false)
    }
  }

  if (loading) {
    return (
      <div className="app-loading" role="status">
        <Loader2 className="animate-spin" aria-hidden="true" />
        <span>{t.historyLoading}</span>
      </div>
    )
  }

  const dateLocale = language === 'zh' ? 'zh-CN' : language === 'en' ? 'en-US' : 'vi-VN'

  return (
    <div className="workspace-shell">
      <WorkspaceHeader
        title={t.historyTitle}
        subtitle={username ? t.historySubtitle.replace('{user}', username) : undefined}
        actions={
          <button
            type="button"
            className={isSelectMode ? 'is-active' : ''}
            onClick={toggleSelectMode}
            aria-label={isSelectMode ? t.selectModeToggleAriaExit : t.selectModeToggleAriaSelect}
            title={isSelectMode ? t.selectModeCancel : t.selectModeMulti}
          >
            {isSelectMode ? <X aria-hidden="true" /> : <ListChecks aria-hidden="true" />}
          </button>
        }
      />

      <main className="history-main">
        <section className="history-heading">
          <div>
            <p className="eyebrow">{t.historyEyebrow}</p>
            <h2>{t.historyHeading}</h2>
            <p>{t.historyDesc}</p>
          </div>
          <div className="history-search">
            <Search aria-hidden="true" />
            <label htmlFor="history-search" className="sr-only">{t.historySearchPlaceholder}</label>
            <input
              id="history-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t.historySearchPlaceholder}
            />
          </div>
        </section>

        <section className="history-stats" aria-label="Overview">
          <div><strong>{sessions.length}</strong><span>{t.statConversations}</span></div>
          <div><strong>{folders.length}</strong><span>{t.statFolders}</span></div>
          <div><strong>{formatDuration(totalDuration, t)}</strong><span>{t.statDuration}</span></div>
          <div className={pendingCount > 0 ? 'has-pending' : ''}>
            <strong>{pendingCount}</strong><span>{t.statPendingSync}</span>
          </div>
        </section>

        {loadError && (
          <div className="session-alert session-alert--danger" role="alert">
            <CloudLightning aria-hidden="true" />
            <p>{loadError}</p>
          </div>
        )}

        {isSelectMode && (
          <div className="selection-toolbar" role="status">
            <span>{t.selectToolbarSelected.replace('{count}', String(selectedIds.length))}</span>
            <button
              type="button"
              onClick={() => setShowFolderModal(true)}
              disabled={selectedIds.length < 2}
            >
              <FolderPlus aria-hidden="true" />
              {t.btnGroupFolder}
            </button>
          </div>
        )}

        {filteredFolders.length > 0 && !isSelectMode && (
          <section className="history-section">
            <div className="section-heading">
              <div>
                <Folder aria-hidden="true" />
                <h3>{t.foldersSection}</h3>
              </div>
              <span>{t.foldersCount.replace('{count}', String(filteredFolders.length))}</span>
            </div>
            <div className="folder-grid">
              {filteredFolders.map((folder) => {
                const sessionCount = sessions.filter((session) => session.folder_id === folder.id).length
                return (
                  <button
                    type="button"
                    key={folder.id}
                    className="folder-item"
                    onClick={() => router.push(`/history/folders/${folder.id}`)}
                  >
                    <span className="folder-item__icon"><Folder aria-hidden="true" /></span>
                    <span className="folder-item__text">
                      <strong>{folder.name}</strong>
                      <small>{sessionCount} {t.statConversations.toLowerCase()}</small>
                    </span>
                    <ChevronRight aria-hidden="true" />
                  </button>
                )
              })}
            </div>
          </section>
        )}

        <section className="history-section">
          <div className="section-heading">
            <div>
              <CalendarDays aria-hidden="true" />
              <h3>{normalizedSearch ? t.searchResultsHeading : isSelectMode ? t.selectConversationsHeading : t.recentConversationsHeading}</h3>
            </div>
            <span>{t.itemsCount.replace('{count}', String(visibleSessions.length))}</span>
          </div>

          {visibleSessions.length === 0 ? (
            <div className="history-empty">
              <FolderOpen aria-hidden="true" />
              <strong>{normalizedSearch ? t.searchNoResults : t.independentConversationsEmpty}</strong>
              <p>{normalizedSearch ? t.searchNoResultsDesc : t.independentConversationsEmptyDesc}</p>
              {!normalizedSearch && sessions.length === 0 && (
                <button type="button" onClick={() => router.push('/session')}>{t.startBtn}</button>
              )}
            </div>
          ) : (
            <div className="history-list">
              {visibleSessions.map((session) => {
                const partner = getPartnerLanguage(session.partner_language, language)
                const selected = selectedIds.includes(session.id)
                const date = new Date(session.started_at)
                return (
                  <button
                    type="button"
                    key={session.id}
                    className={`history-row ${selected ? 'is-selected' : ''}`}
                    onClick={() => handleSessionClick(session)}
                  >
                    {isSelectMode && (
                      <span className="history-check" aria-hidden="true">
                        <input type="checkbox" checked={selected} readOnly tabIndex={-1} />
                      </span>
                    )}
                    <span className="history-row__date">
                      <strong>{date.toLocaleDateString(dateLocale, { day: '2-digit' })}</strong>
                      <small>{date.toLocaleDateString(dateLocale, { month: 'short' })}</small>
                    </span>
                    <span className="history-row__main">
                      <strong>{session.name}</strong>
                      <small>
                        <span className="language-inline"><b>{partner?.shortName ?? session.partner_language.toUpperCase()}</b>{partner?.name ?? session.partner_language}</span>
                        <span><Clock3 aria-hidden="true" />{formatDuration(session.duration_seconds, t)}</span>
                      </small>
                    </span>
                    <span className={`sync-label sync-label--${session.sync_status}`}>
                      {session.sync_status === 'synced' ? <CircleCheck aria-hidden="true" /> : <CloudLightning aria-hidden="true" />}
                      {session.sync_status === 'synced' ? t.syncStatusSynced : session.sync_status === 'failed' ? t.syncStatusFailed : t.syncStatusPending}
                    </span>
                    {!isSelectMode && <ChevronRight className="history-row__arrow" aria-hidden="true" />}
                  </button>
                )
              })}
            </div>
          )}
        </section>
      </main>

      {showFolderModal && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => setShowFolderModal(false)}>
          <section
            className="app-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="folder-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span className="dialog-icon"><FolderPlus aria-hidden="true" /></span>
                <div>
                  <h2 id="folder-dialog-title">{t.createFolderModalTitle}</h2>
                  <p>{t.createFolderGroupDesc.replace('{count}', String(selectedIds.length))}</p>
                </div>
              </div>
              <button type="button" onClick={() => setShowFolderModal(false)} aria-label={t.closeAria}><X aria-hidden="true" /></button>
            </header>
            <label htmlFor="folder-name">{t.folderNameLabel}</label>
            <input
              id="folder-name"
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
              placeholder={t.createFolderPlaceholder}
              maxLength={100}
              autoFocus
            />
            <footer>
              <button type="button" className="secondary-command" onClick={() => setShowFolderModal(false)}>{t.cancelBtn}</button>
              <button
                type="button"
                className="primary-command"
                onClick={handleCreateFolder}
                disabled={!folderName.trim() || isCreatingFolder}
              >
                {isCreatingFolder ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
                {isCreatingFolder ? t.creatingBtn : t.createBtn}
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  )
}
