export const runtime = 'edge'

import { SharedSummaryClient } from './ClientWrapper'

interface PageProps {
  params: Promise<{ id: string }>
}

export default function Page({ params }: PageProps) {
  return <SharedSummaryClient params={params} />
}
