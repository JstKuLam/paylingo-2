export const runtime = 'edge'

import SessionDetailClient from './SessionDetailClient'

interface PageProps {
  params: Promise<{ id: string }>
}

export default function Page({ params }: PageProps) {
  return <SessionDetailClient params={params} />
}
