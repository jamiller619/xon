import { open } from 'node:fs/promises'
import { extname } from 'node:path'

// Widevine System ID: edef8ba9-79d6-4ace-a3c8-27dcd51d21ed
const WIDEVINE_SYSTEM_ID = Buffer.from(
  'edef8ba979d64acea3c827dcd51d21ed',
  'hex',
)

// Adobe ADEPT namespace used in EPUB encryption.xml
const ADOBE_ADEPT_NS = 'http://ns.adobe.com/adept'

// ZIP local file header signature
const ZIP_LOCAL_SIG = 0x04034b50
// ZIP end of central directory signature
const ZIP_EOCD_SIG = 0x06054b50
// ZIP central directory entry signature
const ZIP_CD_SIG = 0x02014b50

/** Read up to `length` bytes from a file at `offset`. Returns the bytes read. */
async function readBytes(
  filePath: string,
  offset: number,
  length: number,
): Promise<Buffer> {
  const fh = await open(filePath, 'r')
  try {
    const buf = Buffer.alloc(length)
    const { bytesRead } = await fh.read(buf, 0, length, offset)
    return buf.subarray(0, bytesRead)
  } finally {
    await fh.close()
  }
}

/**
 * Scan an ISO BMFF (MP4/M4V/M4A) file for a specific 4-byte box type.
 * Returns true if the box type is found at any level of nesting within
 * the first `scanBytes` bytes.
 */
async function mp4HasBox(
  filePath: string,
  boxType: string,
  scanBytes = 65536,
): Promise<boolean> {
  let buf: Buffer
  try {
    buf = await readBytes(filePath, 0, scanBytes)
  } catch {
    return false
  }

  const target = Buffer.from(boxType, 'ascii')
  let offset = 0

  while (offset + 8 <= buf.length) {
    const size = buf.readUInt32BE(offset)
    // Validate box size: must be at least 8 bytes and fit in buffer
    if (size < 8 || offset + size > buf.length + 1) {
      break
    }
    const type = buf.subarray(offset + 4, offset + 8)
    if (type.equals(target)) {
      return true
    }
    offset += size
  }

  return false
}

/**
 * Detect FairPlay DRM in M4V/M4A files.
 * FairPlay-protected files contain a 'drms' sample entry box.
 */
async function detectFairPlay(filePath: string): Promise<boolean> {
  const ext = extname(filePath).toLowerCase()
  if (ext !== '.m4v' && ext !== '.m4a') return false
  try {
    return await mp4HasBox(filePath, 'drms')
  } catch {
    return false
  }
}

/**
 * Detect Widevine DRM in MP4 containers via PSSH box System ID.
 * Scans the file for a 'pssh' box and checks the 16-byte System ID.
 */
async function detectWidevine(filePath: string): Promise<boolean> {
  const ext = extname(filePath).toLowerCase()
  if (
    ext !== '.mp4' &&
    ext !== '.m4v' &&
    ext !== '.m4a' &&
    ext !== '.mov' &&
    ext !== '.mpd'
  ) {
    return false
  }

  let buf: Buffer
  try {
    buf = await readBytes(filePath, 0, 65536)
  } catch {
    return false
  }

  // Search for 'pssh' box (not necessarily top-level — scan linearly)
  const psshTag = Buffer.from('70737368', 'hex') // 'pssh' in hex
  for (let i = 0; i + 32 <= buf.length; i++) {
    if (
      buf[i + 4] === psshTag[0] &&
      buf[i + 5] === psshTag[1] &&
      buf[i + 6] === psshTag[2] &&
      buf[i + 7] === psshTag[3]
    ) {
      // PSSH box layout: size(4) + 'pssh'(4) + version/flags(4) + SystemID(16)
      const systemId = buf.subarray(i + 12, i + 28)
      if (systemId.equals(WIDEVINE_SYSTEM_ID)) {
        return true
      }
    }
  }
  return false
}

/**
 * Detect Adobe ADEPT DRM in EPUB files.
 * Adobe-protected EPUBs are ZIP files containing META-INF/encryption.xml
 * with the Adobe ADEPT namespace.
 */
async function detectAdobeDrm(filePath: string): Promise<boolean> {
  const ext = extname(filePath).toLowerCase()
  if (ext !== '.epub') return false

  // Read the whole file — EPUBs are typically small
  let buf: Buffer
  try {
    const fh = await open(filePath, 'r')
    try {
      const stat = await fh.stat()
      const size = Math.min(stat.size, 4 * 1024 * 1024) // max 4 MB
      const raw = Buffer.alloc(size)
      const { bytesRead } = await fh.read(raw, 0, size, 0)
      buf = raw.subarray(0, bytesRead)
    } finally {
      await fh.close()
    }
  } catch {
    return false
  }

  // Verify ZIP signature
  if (buf.length < 4 || buf.readUInt32LE(0) !== ZIP_LOCAL_SIG) return false

  // Find end-of-central-directory record
  let eocdOffset = -1
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === ZIP_EOCD_SIG) {
      eocdOffset = i
      break
    }
  }
  if (eocdOffset < 0) return false

  const cdOffset = buf.readUInt32LE(eocdOffset + 16)
  const cdSize = buf.readUInt32LE(eocdOffset + 12)

  let cdPos = cdOffset
  while (cdPos + 46 <= cdOffset + cdSize && cdPos + 46 <= buf.length) {
    if (buf.readUInt32LE(cdPos) !== ZIP_CD_SIG) break
    const fnLen = buf.readUInt16LE(cdPos + 28)
    const extraLen = buf.readUInt16LE(cdPos + 30)
    const commentLen = buf.readUInt16LE(cdPos + 32)
    const localOffset = buf.readUInt32LE(cdPos + 42)
    const fileName = buf
      .subarray(cdPos + 46, cdPos + 46 + fnLen)
      .toString('utf8')

    if (fileName === 'META-INF/encryption.xml') {
      // Read the local file entry
      const localHeader = localOffset + 30
      const localFnLen = buf.readUInt16LE(localOffset + 26)
      const localExtraLen = buf.readUInt16LE(localOffset + 28)
      const dataStart = localHeader + localFnLen + localExtraLen
      const compressedSize = buf.readUInt32LE(localOffset + 18)
      const content = buf
        .subarray(dataStart, dataStart + compressedSize)
        .toString('utf8')
      return content.includes(ADOBE_ADEPT_NS)
    }

    cdPos += 46 + fnLen + extraLen + commentLen
  }

  return false
}

/**
 * Detect DRM protection for a media file.
 * Returns true if DRM is detected (FairPlay, Widevine, or Adobe ADEPT).
 * Returns false on any error (non-blocking).
 */
export async function detectDrm(filePath: string): Promise<boolean> {
  try {
    const [fairPlay, widevine, adobe] = await Promise.all([
      detectFairPlay(filePath),
      detectWidevine(filePath),
      detectAdobeDrm(filePath),
    ])
    return fairPlay || widevine || adobe
  } catch {
    return false
  }
}
