import { spawn } from 'node:child_process'
import { extname } from 'node:path'
import sharp from 'sharp'

export const RAW_EXTENSIONS = new Set([
  '.cr2',
  '.cr3',
  '.nef',
  '.arw',
  '.dng',
  '.orf',
  '.raf',
])

/**
 * Returns true if the file path has a RAW camera image extension.
 */
export function isRawImage(filePath: string): boolean {
  return RAW_EXTENSIONS.has(extname(filePath).toLowerCase())
}

/**
 * Convert a RAW camera image to a JPEG buffer using dcraw.
 *
 * Attempts to extract the embedded JPEG preview first (fast, preserves EXIF).
 * Falls back to full RAW decode via dcraw → TIFF → sharp → JPEG if needed.
 *
 * Throws if dcraw is not installed or conversion fails.
 */
export async function convertRawToJpeg(filePath: string): Promise<Buffer> {
  // Fast path: extract embedded JPEG preview from the RAW file (preserves EXIF)
  try {
    return await runDcraw(['-c', '-e', filePath])
  } catch (err) {
    // If dcraw is not installed, propagate immediately — no point trying fallback
    if (err instanceof Error && err.message.startsWith('dcraw not found')) {
      throw err
    }
    // Fall back to full RAW decode: output TIFF to stdout, then convert via sharp
    const tiffBuffer = await runDcraw(['-c', '-w', '-T', filePath])
    return await sharp(tiffBuffer).jpeg({ quality: 90 }).toBuffer()
  }
}

async function runDcraw(args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn('dcraw', args)
    const chunks: Buffer[] = []
    let stderr = ''

    proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    proc.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(
          new Error(
            'dcraw not found. Install dcraw to enable RAW image preview.',
          ),
        )
      } else {
        reject(err)
      }
    })

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks))
      } else {
        reject(new Error(`dcraw failed (exit ${code}): ${stderr}`))
      }
    })
  })
}
