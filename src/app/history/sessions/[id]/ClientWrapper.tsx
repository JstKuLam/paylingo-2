'use client'

import dynamic from 'next/dynamic'

export const SessionDetailClient = dynamic(
  () => import('./SessionDetailClient'),
  { ssr: false }
)
