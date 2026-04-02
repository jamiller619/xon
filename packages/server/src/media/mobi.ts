import { spawn } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'

/**
 * Convert a MOBI/AZW file to EPUB using calibre's ebook-convert tool.
 * Returns the path to the converted EPUB file in a temp directory.
 * Throws if ebook-convert is not available or conversion fails.
 */
export async function convertMobiToEpub(inputPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const base = basename(inputPath, extname(inputPath))

    mkdtemp(join(tmpdir(), 'xon-epub-'))
      .then((tmpDir) => {
        const outputPath = join(tmpDir, `${base}.epub`)
        const proc = spawn('ebook-convert', [inputPath, outputPath])

        let stderr = ''
        proc.stderr.on('data', (chunk: Buffer) => {
          stderr += chunk.toString()
        })

        proc.on('error', (err) => {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            reject(
              new Error(
                'ebook-convert not found. Install calibre to enable MOBI support.',
              ),
            )
          } else {
            reject(err)
          }
        })

        proc.on('close', (code) => {
          if (code === 0) {
            resolve(outputPath)
          } else {
            reject(new Error(`ebook-convert failed (exit ${code}): ${stderr}`))
          }
        })
      })
      .catch(reject)
  })
}
