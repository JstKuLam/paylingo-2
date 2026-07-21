import { FolderDetailClient } from './ClientWrapper'

export const dynamic = 'force-static'

interface PageProps {
  params: Promise<{ id: string }>
}

export default function Page({ params }: PageProps) {
  return <FolderDetailClient params={params} />
}
