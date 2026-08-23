import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const routesDirectory = fileURLToPath(new URL('../../routes', import.meta.url))

describe('route database boundary', () => {
  it('keeps Drizzle queries and schema imports out of route modules', async () => {
    const files = await findTypeScriptFiles(routesDirectory)
    const violations: string[] = []

    for (const file of files) {
      const source = await readFile(file, 'utf8')
      if (/from\s+['"]drizzle-orm['"]/.test(source)) {
        violations.push(`${file}: imports drizzle-orm query builders`)
      }
      if (
        /from\s+['"][^'"]*\/db\/(schema|publicSelections)(?:\.ts)?['"]/.test(
          source,
        )
      ) {
        violations.push(`${file}: imports database schema or public selections`)
      }
      if (
        /\bdb\s*\.\s*(select|insert|update|delete|transaction|query|run|all|get)\b/.test(
          source,
        )
      ) {
        violations.push(`${file}: executes a database operation`)
      }
    }

    expect(violations).toEqual([])
  })
})

async function findTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) return findTypeScriptFiles(path)
      return Promise.resolve(entry.name.endsWith('.ts') ? [path] : [])
    }),
  )
  return files.flat()
}
