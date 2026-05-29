export const runtime = 'edge'

import SharedSummaryClient from './SharedSummaryClient'

interface PageProps {
  params: Promise<{ id: string }>
}

export default function Page({ params }: PageProps) {
  return <SharedSummaryClient params={params} />
}
