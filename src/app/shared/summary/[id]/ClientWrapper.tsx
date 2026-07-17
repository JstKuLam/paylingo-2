'use client'

import dynamic from 'next/dynamic'

export const SharedSummaryClient = dynamic(
  () => import('./SharedSummaryClient'),
  { ssr: false }
)
