import { SessionDetailClient } from './ClientWrapper'

export const dynamicParams = false

export function generateStaticParams() {
  return [{ id: 'fallback' }]
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default function Page({ params }: PageProps) {
  return <SessionDetailClient params={params} />
}
