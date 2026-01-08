import { readFile } from 'node:fs/promises'
export const dynamic = 'force-dynamic'
export default async function DocsPage() {
  let md = ''
  try {
    md = await readFile('/opt/candidature-hub/docs/DEPLOY.md', 'utf8')
  } catch {
    md = '# Documentazione\n\nFile DEPLOY.md non trovato in /opt/candidature-hub/docs/.'
  }
  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-2xl font-semibold mb-4">Documentazione</h1>
      <pre className="whitespace-pre-wrap text-sm border rounded p-4 bg-gray-50">{md}</pre>
    </main>
  )
}
