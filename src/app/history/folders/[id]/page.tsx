import { FolderDetailClient } from './ClientWrapper'

export const dynamicParams = true
export function generateStaticParams() {
  return []
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default function Page({ params }: PageProps) {
  return <FolderDetailClient params={params} />
}
