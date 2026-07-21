export const runtime = 'edge'

import { SessionDetailClient } from './ClientWrapper'

interface PageProps {
  params: Promise<{ id: string }>
}

export default function Page({ params }: PageProps) {
  return <SessionDetailClient params={params} />
}
