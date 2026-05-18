import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { MediaCategory } from '@xon/shared'
import { exifTool } from './binaries.js'

// const DOCUMENT_CATEGORIES = new Set<string>([MediaCategory.Documents])
// const FONT_CATEGORIES = new Set<string>([MediaCategory.Fonts])
// const MODEL3D_CATEGORIES = new Set<string>([MediaCategory.Models3D])
// const ARCHIVE_CATEGORIES = new Set<string>([MediaCategory.Archives])

// export function isDocumentCategory(category: string | null): boolean {
//   if (!category) return false
//   return DOCUMENT_CATEGORIES.has(category)
// }

// export function isFontCategory(category: string | null): boolean {
//   if (!category) return false
//   return FONT_CATEGORIES.has(category)
// }

// export function is3DModelCategory(category: string | null): boolean {
//   if (!category) return false
//   return MODEL3D_CATEGORIES.has(category)
// }

// export function isArchiveCategory(category: string | null): boolean {
//   if (!category) return false
//   return ARCHIVE_CATEGORIES.has(category)
// }

export type DocumentMetadata = {
  pageCount?: number
  author?: string
  title?: string
}

export type FontMetadata = {
  fontFamily?: string
  fontWeight?: string
  fontStyle?: string
  glyphCount?: number
}

export type Model3DMetadata = {
  vertexCount?: number
  faceCount?: number
}

export type ArchiveMetadata = {
  fileCount?: number
  files?: string[]
  totalUncompressedSize?: number
}

async function runExiftool(
  filePath: string,
): Promise<Record<string, unknown> | null> {
  try {
    return (await exifTool.read(filePath)) as Record<string, unknown>
  } catch (err) {
    console.error(`ExifTool error for ${filePath}:`, err)
    return null
  }
}

export async function extractDocumentMetadata(
  filePath: string,
): Promise<DocumentMetadata | null> {
  const data = await runExiftool(filePath)
  if (data === null) return null

  const result: DocumentMetadata = {}
  const pageCount = Number(data.PageCount)
  if (!Number.isNaN(pageCount) && pageCount > 0) result.pageCount = pageCount
  if (typeof data.Author === 'string') result.author = data.Author
  if (typeof data.Title === 'string') result.title = data.Title
  return result
}

export async function extractFontMetadata(
  filePath: string,
): Promise<FontMetadata | null> {
  const data = await runExiftool(filePath)
  if (data === null) return null

  const result: FontMetadata = {}

  const family = data.FamilyName ?? data.FontFamily ?? data.FontName
  if (typeof family === 'string') result.fontFamily = family

  const subfamily = data.FontSubfamily ?? data.SubfamilyName
  if (typeof subfamily === 'string') {
    const sub = subfamily.toLowerCase()
    if (sub.includes('bold')) result.fontWeight = 'Bold'
    else if (sub.includes('black') || sub.includes('heavy'))
      result.fontWeight = 'Black'
    else if (sub.includes('light')) result.fontWeight = 'Light'
    else if (sub.includes('thin')) result.fontWeight = 'Thin'
    else if (sub.includes('medium')) result.fontWeight = 'Medium'
    else result.fontWeight = 'Regular'

    if (sub.includes('italic') || sub.includes('oblique'))
      result.fontStyle = 'Italic'
    else result.fontStyle = 'Normal'
  }

  const glyphCount = Number(data.NumGlyphs)
  if (!Number.isNaN(glyphCount) && glyphCount > 0)
    result.glyphCount = glyphCount

  return result
}

// 3D Model extraction

type GltfAccessor = { count?: number }
type GltfPrimitive = { attributes?: { POSITION?: number }; indices?: number }
type GltfMesh = { primitives?: GltfPrimitive[] }
type GltfFile = { accessors?: GltfAccessor[]; meshes?: GltfMesh[] }

async function parseObjFile(filePath: string): Promise<Model3DMetadata> {
  const content = await readFile(filePath, 'utf8')
  let vertexCount = 0
  let faceCount = 0
  for (const line of content.split('\n')) {
    const t = line.trimStart()
    if (t.startsWith('v ')) vertexCount++
    else if (t.startsWith('f ')) faceCount++
  }
  const result: Model3DMetadata = {}
  if (vertexCount > 0) result.vertexCount = vertexCount
  if (faceCount > 0) result.faceCount = faceCount
  return result
}

async function parseGltfFile(filePath: string): Promise<Model3DMetadata> {
  const content = await readFile(filePath, 'utf8')
  const gltf = JSON.parse(content) as GltfFile
  const accessors = gltf.accessors ?? []
  const meshes = gltf.meshes ?? []
  let vertexCount = 0
  let faceCount = 0
  for (const mesh of meshes) {
    for (const prim of mesh.primitives ?? []) {
      if (prim.attributes?.POSITION !== undefined) {
        const acc = accessors[prim.attributes.POSITION]
        if (acc?.count !== undefined) vertexCount += acc.count
      }
      if (prim.indices !== undefined) {
        const indAcc = accessors[prim.indices]
        if (indAcc?.count !== undefined)
          faceCount += Math.floor(indAcc.count / 3)
      }
    }
  }
  const result: Model3DMetadata = {}
  if (vertexCount > 0) result.vertexCount = vertexCount
  if (faceCount > 0) result.faceCount = faceCount
  return result
}

export async function extract3DModelMetadata(
  filePath: string,
): Promise<Model3DMetadata | null> {
  const ext = extname(filePath).toLowerCase()
  try {
    if (ext === '.obj') return await parseObjFile(filePath)
    if (ext === '.gltf') return await parseGltfFile(filePath)
    return {}
  } catch (err) {
    console.error(
      `3D model extraction failed for ${filePath}: ${(err as Error).message}`,
    )
    return null
  }
}

// Archive extraction

const ZIP_CD_SIG = 0x02014b50
const ZIP_EOCD_SIG = 0x06054b50

function parseZipBuffer(data: Buffer): ArchiveMetadata {
  // Find End of Central Directory record (search from end)
  const maxSearch = Math.min(data.length, 65535 + 22)
  let eocdOffset = -1
  for (let i = data.length - 22; i >= data.length - maxSearch; i--) {
    if (i >= 0 && data.readUInt32LE(i) === ZIP_EOCD_SIG) {
      eocdOffset = i
      break
    }
  }
  if (eocdOffset === -1) return {}

  const totalEntries = data.readUInt16LE(eocdOffset + 10)
  const cdOffset = data.readUInt32LE(eocdOffset + 16)

  const files: string[] = []
  let totalUncompressedSize = 0
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

    files.push(filename)
    totalUncompressedSize += uncompressedSize
    offset += 46 + filenameLen + extraLen + commentLen
  }

  return { fileCount: files.length, files, totalUncompressedSize }
}

function parseTarBuffer(data: Buffer): ArchiveMetadata {
  const files: string[] = []
  let totalUncompressedSize = 0
  let offset = 0

  while (offset + 512 <= data.length) {
    const block = data.subarray(offset, offset + 512)
    // Two zero blocks = end of archive
    if (block[0] === 0) break

    // Filename at bytes 0-99 (null-terminated), with USTAR prefix at 345-499
    let nameEnd = block.indexOf(0, 0)
    if (nameEnd === -1 || nameEnd > 100) nameEnd = 100
    let filename = block.subarray(0, nameEnd).toString('utf8')

    // USTAR prefix: check magic at offset 257
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

    // File size in octal at bytes 124-135
    const sizeOctal = block
      .subarray(124, 136)
      .toString('utf8')
      .replace(/\0/g, '')
      .trim()
    const fileSize = Number.parseInt(sizeOctal, 8)

    // Typeflag at byte 156: 0x30='0' or 0=regular file, 0x35='5'=directory
    const typeflag = block[156]
    if (typeflag === 0x30 || typeflag === 0) {
      if (filename) {
        files.push(filename)
        if (!Number.isNaN(fileSize)) totalUncompressedSize += fileSize
      }
    }

    const dataBlocks = !Number.isNaN(fileSize) ? Math.ceil(fileSize / 512) : 0
    offset += 512 + dataBlocks * 512
  }

  return { fileCount: files.length, files, totalUncompressedSize }
}

export async function extractArchiveMetadata(
  filePath: string,
): Promise<ArchiveMetadata | null> {
  const ext = extname(filePath).toLowerCase()
  try {
    if (ext === '.zip') {
      const data = await readFile(filePath)
      return parseZipBuffer(data)
    }
    if (ext === '.tar' || ext === '.tgz' || filePath.endsWith('.tar.gz')) {
      let data = await readFile(filePath)
      // Decompress if gzipped (magic bytes 1F 8B)
      if (data[0] === 0x1f && data[1] === 0x8b) {
        data = gunzipSync(data)
      }
      return parseTarBuffer(data)
    }
    return {}
  } catch (err) {
    console.error(
      `Archive extraction failed for ${filePath}: ${(err as Error).message}`,
    )
    return null
  }
}
