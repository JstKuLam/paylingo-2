export const runtime = 'edge'

import { FolderDetailClient } from './ClientWrapper'

interface PageProps {
  params: Promise<{ id: string }>
}

export default function Page({ params }: PageProps) {
  return <FolderDetailClient params={params} />
}
