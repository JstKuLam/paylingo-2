import { SharedSummaryClient } from './ClientWrapper'

export const dynamicParams = true

export function generateStaticParams() {
  return [{ id: 'fallback' }]
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default function Page({ params }: PageProps) {
  return <SharedSummaryClient params={params} />
}
