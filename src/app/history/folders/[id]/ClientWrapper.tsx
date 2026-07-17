'use client'

import dynamic from 'next/dynamic'

export const FolderDetailClient = dynamic(
  () => import('./FolderDetailClient'),
  { ssr: false }
)
