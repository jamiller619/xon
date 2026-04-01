import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { gunzipSync } from 'node:zlib'

export type ArchiveEntry = {
  path: string
  size: number
  isDirectory: boolean
}

const ZIP_CD_SIG = 0x02014b50
const ZIP_EOCD_SIG = 0x06054b50

function listZipContents(data: Buffer): ArchiveEntry[] {
  const maxSearch = Math.min(data.length, 65535 + 22)
  let eocdOffset = -1
  for (let i = data.length - 22; i >= data.length - maxSearch; i--) {
    if (i >= 0 && data.readUInt32LE(i) === ZIP_EOCD_SIG) {
      eocdOffset = i
      break
    }
  }
  if (eocdOffset === -1) return []

  const totalEntries = data.readUInt16LE(eocdOffset + 10)
  const cdOffset = data.readUInt32LE(eocdOffset + 16)

  const entries: ArchiveEntry[] = []
  let offset = cdOffset

  for (let i = 0; i < totalEntries; i++) {
    if (offset + 46 > data.length) break
    if (data.readUInt32LE(offset) !== ZIP_CD_SIG) break

    const uncompressedSize = data.readUInt32LE(offset + 24)
    const filenameLen = data.readUInt16LE(offset + 28)
    const extraLen = data.readUInt16LE(offset + 30)
    const commentLen = data.readUInt16LE(offset + 32)
    const filename = data
      .subarray(offset + 46, offset + 46 + filenameLen)
      .toString('utf8')

    const isDirectory = filename.endsWith('/')
    entries.push({ path: filename, size: uncompressedSize, isDirectory })
    offset += 46 + filenameLen + extraLen + commentLen
  }

  return entries
}

function listTarContents(data: Buffer): ArchiveEntry[] {
  const entries: ArchiveEntry[] = []
  let offset = 0

  while (offset + 512 <= data.length) {
    const block = data.subarray(offset, offset + 512)
    if (block[0] === 0) break

    let nameEnd = block.indexOf(0, 0)
    if (nameEnd === -1 || nameEnd > 100) nameEnd = 100
    let filename = block.subarray(0, nameEnd).toString('utf8')

    const magic = block.subarray(257, 262).toString('utf8')
    if (magic.startsWith('ustar')) {
      const prefixEnd = block.indexOf(0, 345)
      const prefixLen =
        prefixEnd === -1 || prefixEnd > 500 ? 155 : prefixEnd - 345
      if (prefixLen > 0) {
        const prefix = block.subarray(345, 345 + prefixLen).toString('utf8')
        filename = `${prefix}/${filename}`
      }
    }

    const sizeOctal = block
      .subarray(124, 136)
      .toString('utf8')
      .replace(/\0/g, '')
      .trim()
    const fileSize = Number.parseInt(sizeOctal, 8)
    const typeflag = block[156]

    if (filename) {
      const isDirectory = typeflag === 0x35
      if (typeflag === 0x30 || typeflag === 0 || isDirectory) {
        entries.push({
          path: filename,
          size: Number.isNaN(fileSize) ? 0 : fileSize,
          isDirectory,
        })
      }
    }

    const dataBlocks = !Number.isNaN(fileSize) ? Math.ceil(fileSize / 512) : 0
    offset += 512 + dataBlocks * 512
  }

  return entries
}

function list7zContents(filePath: string): Promise<ArchiveEntry[]> {
  return new Promise((resolve) => {
    let stdout = ''
    const proc = spawn('7z', ['l', '-slt', filePath])

    proc.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })

    proc.on('error', () => {
      resolve([])
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        resolve([])
        return
      }

      const entries: ArchiveEntry[] = []
      const blocks = stdout.split(/^----------$/m)

      for (const block of blocks) {
        const lines = block.trim().split('\n')
        const kvMap: Record<string, string> = {}
        for (const line of lines) {
          const eqIdx = line.indexOf(' = ')
          if (eqIdx !== -1) {
            const key = line.substring(0, eqIdx).trim()
            const value = line.substring(eqIdx + 3).trim()
            kvMap[key] = value
          }
        }

        const path = kvMap.Path
        if (!path) continue

        const sizeStr = kvMap.Size
        const size = sizeStr ? Number.parseInt(sizeStr, 10) || 0 : 0
        const isDirectory = kvMap.Folder === '+'

        entries.push({ path, size, isDirectory })
      }

      resolve(entries)
    })
  })
}

export async function listArchiveContents(
  filePath: string,
): Promise<ArchiveEntry[]> {
  const ext = extname(filePath).toLowerCase()
  try {
    if (ext === '.zip') {
      const data = await readFile(filePath)
      return listZipContents(data)
    }
    if (ext === '.tar' || ext === '.tgz' || filePath.endsWith('.tar.gz')) {
      let data = await readFile(filePath)
      if (data[0] === 0x1f && data[1] === 0x8b) {
        data = gunzipSync(data)
      }
      return listTarContents(data)
    }
    if (ext === '.7z') {
      return await list7zContents(filePath)
    }
  } catch (err) {
    console.error(
      `Archive listing failed for ${filePath}: ${(err as Error).message}`,
    )
  }
  return []
}
