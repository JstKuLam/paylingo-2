import { FolderDetailClient } from './ClientWrapper'

export function generateStaticParams() {
  return [{ id: '1' }]
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default function Page({ params }: PageProps) {
  return <FolderDetailClient params={params} />
}
